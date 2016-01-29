/**
 * @document   : ignorecapslock.background.js
 * @package    : Ignore Caps Lock Chrome Extension
 * @author     : devshans
 * @copyright  : 2016, devshans
 * @license    : The MIT License (MIT) - see LICENSE.TXT
 * @description: Background service for capslock.extension.js
 *   Communicates user input for enable/disable to content script.
 */

var enable = true;
var background_debug = false;

// Background task to trigger on the click of the extension icon.
function enableCapsLock() {
    enable = !enable;
    if (background_debug) console.log("enabled: " + enable);
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
	// Trigger a one-time JSON-serializable message from this to the extension content-script.
	//   Will send to the instance running on the current tab.	
	chrome.tabs.sendMessage(tabs[0].id, {action: enable ? "enable" : "disable"}, function(response) {});
	// Change the icon to enabled/disabled on the current tab.
	chrome.browserAction.setIcon({
	    path: enable ? "images/icon_enable19.png" : "images/icon_disable19.png",
	    tabId: tabs[0].id
	});
    });
};

chrome.browserAction.onClicked.addListener(enableCapsLock);

