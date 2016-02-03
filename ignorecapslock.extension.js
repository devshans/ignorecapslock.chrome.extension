/**
 * @document   : ignorecapslock.extension.js
 * @package    : Ignore Caps Lock Chrome Extension
 * @author     : devshans
 * @copyright  : 2016, devshans
 * @license    : The MIT License (MIT) - see LICENSE
 * @description: Extension content script
 *   Enabled/Disabled from ignorecapslock.background.js
 *   Listens on keystroke inputs and reverses the effect of caps lock if detected.
*/


/**
 * Create the CapsLock object for the Chrome extension
 */
var CapsLock = new function(){

    // DEBUG variable. Need to modify here to enable all debug console output. 
    var DEBUG = false; 
    
    // Global content script enable
    var enabled = true; //fixme - SPS. We probably want to change to some sort of setting. And most likely not default to being on.   

    // Implement a message passing listener to handle messages from background service.
    //   Enable/disable based on instruction found in message.
    chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
	    if (DEBUG) console.log("action: " + request.action);	
	    if      (request.action == "enable")  enabled = true;
	    else if (request.action == "disable") enabled = false;
	}
    );

    // State variables
    var capsLock       = false;
    var backspace      = false;
    var priorBackspace = false;

    // Variables set in handleKeyPress for later use in handleInput when doHandleInput
    var doHandleInput = false;
    var contentEditableElem;
    var cursorPosition;
    var modifiedText;

    // ------------------------------------------------------------------------------
    // Event Listener Functions
    // ------------------------------------------------------------------------------    

    // Register the event listeners

    // Use "true", to bind events to the capturing phase.
    //   "false" will bind to the bubbling phase which can be
    //   broken with event.stopPropagation().
    if (window != null && window.addEventListener){
        window.addEventListener('keypress', handleKeyPress,  true);
	window.addEventListener('keydown',  handleBackspace, true);
	window.addEventListener('input',    handleInput,     true);
    } else {
        document.documentElement.attachEvent('onkeypress', handleKeyPress);
	document.documentElement.attachEvent('onkeydown', handleBackspace);
	document.documentElement.attachEvent('oninput', handleKeyPress);
    }    

    /** 
     * @function   : handleKeyPress
     * @description: Updates case of character pressed based on the status 
     *   of the caps lock key.
     * 
     * @listens: KeyPress keyboard event
     * @param  : evnt - KeyPress keyboard event. Defaults to window.event.
     */
    function handleKeyPress(evnt) {	   

	if (!enabled) return;

	var charCode = 0;
	var charKey  = "";
	var isContentEditableDiv = false;

	var elem = getElementFromEvent(evnt);

	// Check for supported HTML element types.
	if (!(elem.type == "textarea" || elem.type == "text")) {
	    if (elem.isContentEditable) {
		isContentEditableDiv = true;

		// Walk down the DOM until the last non-textarea element if found.
		// (Stop at the end of a <span>/<div> tree.)
		contentEditableElem = elem;
		while (contentEditableElem && contentEditableElem.childNodes.length > 0 &&
		       (contentEditableElem.childNodes[0].nodeName.toLowerCase() == "div" ||
			contentEditableElem.childNodes[0].nodeName.toLowerCase() == "span"))
		    contentEditableElem = contentEditableElem.childNodes[0];

		// Special case for Facebook
		//   Initializes an empty <br> inside <span> element that is updated
		//   to a nested <span> when text is entered.
		if (contentEditableElem && contentEditableElem.childNodes.length > 0 &&
		    contentEditableElem.childNodes[0].nodeName.toLowerCase() == "br") {
		    var node = document.createElement("span");
		    node.setAttribute("data-text", "true");
		    var textnode = document.createTextNode("");      
		    node.appendChild(textnode);
                    contentEditableElem.removeChild(contentEditableElem.childNodes[0]);
		    contentEditableElem.appendChild(node);
		    contentEditableElem = contentEditableElem.childNodes[0];
		}
		
		if (DEBUG) console.log("contentEditable text: " + contentEditableElem.textContent);
	    } else {
		if (DEBUG) console.log("unsupported element type: " + elem.type);
		return; // EXIT function
	    }
	}
	
        // Determine the character code from the keyboard input key.
        charCode = (evnt.charCode ? evnt.charCode : evnt.keyCode);
	if (DEBUG) console.log("charCode: " + charCode);		

        // Store whether the caps lock key is down...
        if (charCode >= 97 && charCode <= 122){
	    capsLock = evnt.shiftKey;
	    charKey = String.fromCharCode(charCode);
        }
	// ... or not.
	else if (charCode >= 65 && charCode <= 90
		  && !(evnt.shiftKey && /Mac/.test(navigator.platform))){
	    capsLock = !evnt.shiftKey;
	    charKey = String.fromCharCode(charCode);
        }
	// Non-alphabet character
	else { 
	    if (DEBUG) console.log("Not an alphabet character.");
	    return; // EXIT function
	}

	if (DEBUG) console.log("Found alphabet character.");
	if (DEBUG) console.log("capsLock: " + capsLock + " charKey: " + charKey);

	// We need to make a modification to the case of the character entered.
	if (capsLock) {

	    // Content editable divs are a bit annoying.
	    //   At least in the case of Google hangouts, the text will be dynamically
	    //     edited after the keypress event has finished. Here we prepare for
	    //     setting the modified text later in the event lifecycle during the
	    //     input event.
	    //   The content read from the div element won't be reflected here yet
	    //     so we'll have to insert it manually.
	    if (isContentEditableDiv) {

		// Remove selected text if we try to overwrite it.
		var divText = contentEditableElem.textContent;
		var range = window.getSelection().getRangeAt(0);		
		divText = [divText.slice(0, range.startOffset), charKey, divText.slice(range.endOffset)].join('');
		
		cursorPosition = range.startOffset + 1;
		if (DEBUG) console.log("cursorPosition: " + cursorPosition);

		doHandleInput = true;

		modifiedText = getModifiedText(charCode,
					       charKey,
					       evnt,
					       divText,						   
					       cursorPosition);
		
		// Try to do this once, can be done again later in event lifecycle
		//   in handleInput if overwritten.
		// This handles the case where an input event isn't fired later after keypress
		//   but the text isn't overwritten either.
		contentEditableElem.innerHTML = modifiedText;
		setCursorPosition(contentEditableElem, cursorPosition);
		// It's possible where's there's a case that an input event isn't fired BUT
		//   the text is overwritten. We'll need to handle that if it is seen in a
		//   supported applications.
	    }

	    // A more straightforward text/textarea input element.
	    else {
		$(elem).unbind('input').bind('input', function() {
		    cursorPosition = $(this).prop("selectionStart");
		    modifiedText = getModifiedText(charCode,
						   charKey,
						   evnt,
						   $(this).val(), 
						   cursorPosition);
		    $(this).val(modifiedText);
		    setCursorPosition($(this).get(0), cursorPosition);
		    $(elem).unbind('input');
		});
	    }
	} //end if(capsLock)
	
    } //endfunction handleKeyPress

    /** 
     * @function   : handleBackspace
     * @description: Listens to KeyDown events and looks for backspace keys.
     *   *** Doesn't actually do anything right now. Looking to use it to handle
     *    weird behavior with Facebook.
     * 
     * @listens: KeyDown keyboard event
     * @param  : evnt - KeyDown keyboard event. Defaults to window.event.
     */
    function handleBackspace(evnt){
	if (!enabled) return;
	var elem = getElementFromEvent(evnt);
	priorBackspace = backspace;
	backspace = (evnt.keyCode == 8);
	if (!backspace) return;
	if (DEBUG) console.log("Backspace key");
	var cursorPosition = getCursorPosition(elem);
	
	//fixme - SPS. Gives errors sometimes.
//	setCursorPosition(elem, cursorPosition);
    } //endfunction handleBackspace

    /** 
     * @function   : handleInput
     * @description: Updates case ofcharacter pressed based on the status 
     *   of the caps lock key.
     * 
     * @listens: Input event.  
     *   Occurs when the value of an <input> or <textarea> element is changed.
     * @param  : evnt - Input event. Defaults to window.event.
     */
    function handleInput(evnt) {
	if (doHandleInput) {
	    
	    var elem = getElementFromEvent(evnt);
	    contentEditableElem.innerHTML = modifiedText;
	    setCursorPosition(contentEditableElem, cursorPosition);
	    doHandleInput = false;		
	}
    } //endfunction handleInput


    // ------------------------------------------------------------------------------
    // Helper Functions
    // ------------------------------------------------------------------------------

    /** 
     * @function   : getElementFromEvent
     * @description: Retrieves HTML element where an event was triggered.
     * 
     * @param: evnt - Any event. 
     */    
    function getElementFromEvent(evnt) {
	// Ensure the event object is defined
	if (!evnt) evnt = window.event;	    
	return evnt.srcElement;
    } //endfunction getElementFromEvent    

    /** 
     * @function   : getModifiedText
     * @description: Creates appropriate text for a caps lock change condition.
     * 
     * @param: charCode       - Numeric code of key pressed.
     * @param: charKey        - ASCII value of key pressed.
     * @param: evnt           - Calling function that triggered the event.
     * @param: inputText      - Full text to modify.
     * @param: cursorPosition - Current index of the cursor in the text.
     */    
    function getModifiedText(charCode, charKey, evnt, inputText, cursorPosition){

	if (DEBUG) console.log("getModifiedText()\n" +
			       "inputText:"           + inputText +
			       ", inputText.length: " + inputText.length +
			       ", cursorPosition: "   + cursorPosition);

	// Is LOWERcase alphabet character
	if (charCode >= 97 && charCode <= 122) {
	    charKey = charKey.toUpperCase();
	}
	// Is UPPERcase alphabet character
	else if (charCode >= 65 && charCode <= 90 
		 && !(evnt.shiftKey && /Mac/.test(navigator.platform))){
	    charKey = charKey.toLowerCase();
	}
	
	// If appending to the end of the string:
	//   1. Strip off last character of whole string.
	//   2. Append with the modified one.
	if (cursorPosition == inputText.length) {
	    var trimmedInput = inputText.substr(0,(inputText.length -1));
	    inputText = trimmedInput + charKey;
	    if (DEBUG) console.log("trimmedInput: " + trimmedInput + " charKey: " + charKey); 
	}
	// Otherwise, we need to:
	//   1. Split the string in half.
	//   2. Strip off the last character from the 1st half.
	//   3. Append modified character to 1st half.
	//   4. Append 2nd half of string to 1st.
	else {
	    var firstHalf = inputText.substr(0,(cursorPosition-1));
	    var secondHalf = inputText.substr((cursorPosition),(inputText.length -1));
	    inputText = firstHalf + charKey + secondHalf;
	    if (DEBUG) console.log("firstHalf: " + firstHalf + " secondHalf: " + secondHalf); 
	}
	
	return inputText;
    } //endfunction getModifiedText

    /** 
     * @function   : getCursorPosition
     * @description: Focuses on the element of the calling function and 
     *   sets the cursor to the appropriate location in the text.
     * 
     * @param: elem - HTML element to detect cursor position in.
     * @param: cursorPosition - Desired index of the cursor in the text.
     */        
    function getCursorPosition(elem) {

	var cursorPosition;
	if (elem.setSelectionRange) {
	    cursorPosition = elem.selectionStart;
	} else {
	    var sel = window.getSelection();
	    var range = sel.getRangeAt(0);
	    cursorPosition = range.startOffset;
	}
	return cursorPosition;
    } //endfunction getCursorPosition

    /** 
     * @function   : setCursorPosition
     * @description: Focuses on the element of the calling function and 
     *   sets the cursor to the appropriate location in the text.
     * 
     * @param: elem - HTML element to modify cursor position in.
     * @param: cursorPosition - Desired index of the cursor in the text.
     */        
    function setCursorPosition(elem, cursorPosition) {

	elem.focus();

	// Input text box
	if (elem.setSelectionRange) {
	    elem.setSelectionRange(cursorPosition, cursorPosition);
	}
	
	// Content editable div
	else { 
	    var textElem = elem.firstChild;
	    var range = document.createRange();
	    range.setStart(textElem, cursorPosition);
	    range.setEnd(textElem, cursorPosition);
	    var sel = window.getSelection();
	    sel.removeAllRanges();
	    sel.addRange(range);
	}    
    } //endfunction setCursorPosition
     

}(); //end CapsLock
