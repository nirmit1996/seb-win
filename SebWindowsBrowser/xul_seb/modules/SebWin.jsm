/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the browser component of seb.
 *
 * The Initial Developer of the Original Code is Stefan Schneider <schneider@hrz.uni-marburg.de>.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Stefan Schneider <schneider@hrz.uni-marburg.de>
 *   
 * ***** END LICENSE BLOCK ***** */

/* ***** GLOBAL seb SINGLETON *****

* *************************************/ 

/* 	for javascript module import
	see: https://developer.mozilla.org/en/Components.utils.import 
*/

this.EXPORTED_SYMBOLS = ["SebWin"];

/* Modules */
const 	{ classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components,
	{ scriptloader } = Cu.import("resource://gre/modules/Services.jsm").Services;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/* Services */
let 	wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator),
	ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher),
	wpl = Ci.nsIWebProgressListener,
	wnav = Ci.nsIWebNavigation;
	
/* SebGlobals */
scriptloader.loadSubScript("resource://globals/prototypes.js");
scriptloader.loadSubScript("resource://globals/const.js");

/* SebModules */
XPCOMUtils.defineLazyModuleGetter(this,"sl","resource://modules/SebLog.jsm","SebLog");
XPCOMUtils.defineLazyModuleGetter(this,"su","resource://modules/SebUtils.jsm","SebUtils");
XPCOMUtils.defineLazyModuleGetter(this,"sb","resource://modules/SebBrowser.jsm","SebBrowser");
XPCOMUtils.defineLazyModuleGetter(this,"sh","resource://modules/SebHost.jsm","SebHost");

/* ModuleGlobals */
let 	base = null,
	seb = null,
	pos = {
		0 : "left",
		1 : "center",
		2 : "right"
	};
	
const	xulFrame = "seb.iframe",
	xulBrowser = "seb.browser",
	xulErr = "chrome://seb/content/err.xul",
	xulLoad	= "chrome://seb/content/load.xul",
	contentDeck = 0,
	serverDeck = 1,
	messageDeck = 2,
	STATE_MAXIMIZED = 1, 	//The window is maximized.
	STATE_MINIMIZED = 2, 	//The window is minimized.
	STATE_NORMAL = 3, 	//The window is normal.
	STATE_FULLSCREEN = 4, 	//The window is in full screen mode.
	pdfViewer = "chrome://pdfjs/content/web/viewer.html?file=",
	pdfViewerName = "sebPdfViewer";
	
this.SebWin = {
	wins : [],
	lastWin : null,
	mainScreen : {},
	popupScreen : {},
	winTypesReg : {
		pdfViewer : /^.*?\/pdfjs\/.*?viewer\.html\?file\=/
	},
	
	init : function(obj) {
		base = this;
		seb = obj;
		sl.out("SebWin initialized: " + seb);
	},
	
	getWinType : function (win) {
		var w = win.document.getElementsByTagName("window");
		if (w.length === 0) {
			w = win.document.getElementsByTagName("dialog");
		}
		return w[0].getAttribute("windowtype");
	},
	
	setWinType : function (win,type) {
		win.document.getElementsByTagName("window")[0].setAttribute("windowtype",type);
	},
	
	setSizeMode : function (win,mode) {
		win.document.getElementsByTagName("window")[0].setAttribute("sizemode",mode);
	},
	
	addWin : function (win) {
		sl.debug("addWin");
		let t = base.getWinType(win);
		if (t == "main") {
			if (base.wins.length >= 1) { // secondary
				base.setWinType(win,"secondary");
			}
			base.lastWin = win;
			sb.initBrowser(win);
			base.wins.push(win);
			
			sl.debug("window added with type: " + base.getWinType(win));
			sl.debug("windows count: " + base.wins.length);
		}
		else {
			sl.debug("ommit window handling for " + t);
		}
	},
	
	getRecentWin : function () {
		return wm.getMostRecentWindow(null);
	},
	
	getWebBrowserChrome : function(w) { // only exists in firefox not in xulrunner?
		return ww.getChromeForWindow(w);
	},
	
	getChromeWin : function (w) {
		return w.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIDOMWindow);
	},
	
	getDOMChromeWin : function (w) {
		return w.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIDOMWindow)
                   .QueryInterface(Ci.nsIDOMChromeWindow);
	},
	
	getXulWin : function(w) {
		return w.QueryInterface(Ci.nsIInterfaceRequestor)
		      .getInterface(Ci.nsIWebNavigation)
		      .QueryInterface(Ci.nsIDocShellTreeItem).treeOwner
		      .QueryInterface(Ci.nsIInterfaceRequestor)
		      .getInterface(Ci.nsIXULWindow);
	},
	
	closeAllWin : function() {
		for (var i=base.wins.length-1;i>=0;i--) { 
			try {
				sl.debug("close window ...");
				base.wins[i].close();
			}
			catch(e) {
				sl.err(e);
			}
		}
	},
	
	removeWin : function (win) {
		if (base.getWinType(win) == "main") { // never remove the main window, this must be controlled by the host app 
			return;
		} 
		for (var i=0;i<base.wins.length;i++) {
			if (base.wins[i] === win) {
				//var n = (win.document && win.content) ? getWinType(win) + ": " + win.document.title : " empty document";
				//_debug("remove win from array: " + ;
				sl.debug("windows count: " + base.wins.length);
				sl.debug("remove win from array ...");
				base.wins.splice(i,1);
				sl.debug("windows count: " + base.wins.length);
				break;
			}
		}
	},
	
	removeSecondaryWins : function () {
		let main = null;
		for (var i=0;i<base.wins.length;i++) {
			let win = base.wins[i];
			if (base.getWinType(win) != "main") {
				var n = (win.document && win.content) ? base.getWinType(win) + ": " + win.document.title : " empty document";
				sl.debug("close win from array: " + n);
				win.close();
			} 
			else {
				main = win;
			}
		}
		base.wins = [];
		base.wins.push(main);
	},
	
	resetWindows : function () { // close all secondary wins (the modal reconf dialog has to be closed from seb.jsm)
		for (var i=0;i<base.wins.length;i++) {
			let win = base.wins[i];
			if (base.getWinType(win) != "main") {
				var n = (win.document && win.content) ? base.getWinType(win) + ": " + win.document.title : " empty document";
				sl.debug("close win from array: " + n);
				win.close();
			}
		}
		base.wins = [];	// empty base wins, main win will be reloaded and readded
		base.setSizeMode(seb.mainWin,"maximized");
		seb.mainWin.maximize();
		base.mainScreen = {};
		base.popupScreen = {};
	},
	
	openDistinctWin : function(url) {
		sl.debug("openDistinctWin");
		for (var i=base.wins.length-1;i>=0;i--) { 
			//sl.debug(url + " = " + atob(base.wins[i].document.getElementsByTagName("window")[0].getAttribute("baseurl")));
			sl.debug(url + " = " + atob(base.wins[i].XULBrowserWindow.baseurl));
			try {
				let a = btoa(url);
				let b = btoa(url+"/"); // aRequest object adds a slash to urls
				let c = base.wins[i].XULBrowserWindow.baseurl;
				// // pdf viewer "chrome:" url is transformed to "file:" url by aRequest, so i have to pick up the ?file=.* part to compare
				if (base.winTypesReg.pdfViewer.test(url) && base.winTypesReg.pdfViewer.test(atob(c))) {
					a = b = btoa(url.split('?file=')[1]); // only compare file part of pdf viewer
					c = btoa(atob(c).split('?file=')[1]);
				}
				if (a == c || b == c) {
					sl.debug("url " + url + " already open: window.focus()");
					base.wins[i].focus();
					return;
				}
			}
			catch(e) {
				sl.err(e);
				return;
			}
		}
		base.openWin(url);
	},
	
	openPdfViewer : function(url) {
		base.openDistinctWin(pdfViewer+url);
	},
	
	openWin : function(url) {
		seb.mainWin.open(url);
	},
	
	setToolbar : function (win) {
		var tb = win.document.getElementById("toolBar");
		var ib = win.document.getElementById("imageBox");
		if (win === seb.mainWin) { // main win
			if (su.getConfig("enableBrowserWindowToolbar", "boolean", false)) {
				sl.debug("setToolbar visible");
				tb.className = (su.getConfig("touchOptimized", "boolean", false)) ? "tbTouch" : "tbDesktop";			
				ib.className = (su.getConfig("touchOptimized", "boolean", false)) ? "tbTouch" : "tbDesktop";
				if (!su.getConfig("allowBrowsingBackForward","boolean",false)) {
					win.document.getElementById("btnBack").className = "hidden";
					win.document.getElementById("btnForward").className = "hidden";
				}
				if (!su.getConfig("sebToolbarShowReload","boolean",false)) {
					win.document.getElementById("btnReload").className = "hidden";
				}
				/*
				if (!su.getConfig("mainBrowserRestart","boolean",false)) {
					win.document.getElementById("btnRestart").className = "hidden";
				}
				if (!su.getConfig("allowQuit","boolean",false)) {
					win.document.getElementById("btnQuit").className = "hidden";
				}
				*/ 
				sb.refreshNavigation(win);	
			}
			else {
				sl.debug("setToolbar invisible");
				tb.className = "tbHidden";
				ib.className = "tbHidden";
				//base.resetAndhideElement(win.document.getElementById("btnBack"));
				//base.resetAndhideElement(win.document.getElementById("btnForward"));
				win.document.getElementById("btnBack").className = "hidden";
				win.document.getElementById("btnForward").className = "hidden";
				win.document.getElementById("btnReload").className = "hidden";
			}
		}
		else { // popup
			if (su.getConfig("newBrowserWindowNavigation", "boolean", false)) {
				tb.className = (su.getConfig("touchOptimized", "boolean", false)) ? "tbTouch" : "tbDesktop";
				ib.className = (su.getConfig("touchOptimized", "boolean", false)) ? "tbTouch" : "tbDesktop";
				win.document.getElementById("btnBack").className = "hidden";
				win.document.getElementById("btnForward").className = "hidden";
				if (!su.getConfig("sebToolbarShowReload","boolean",false)) {
					win.document.getElementById("btnReload").className = "hidden";
					
				}
				sb.refreshNavigation(win);
			}
			else {
				tb.className = "tbHidden";
				ib.className = "tbHidden";
				win.document.getElementById("btnBack").className = "hidden";
				win.document.getElementById("btnForward").className = "hidden";
				win.document.getElementById("btnReload").className = "hidden";
			}
		}
	},
	
	/* deprecated */
	showContent : function (win,fromkey) { 
		sl.debug("showContent...");
		base.showDeck(win,fromkey,contentDeck);
	},
	
	showServer : function (win,fromkey) { 
		sl.debug("showServer...");
		base.showDeck(win,fromkey,serverDeck);
	},
	
	showMessage : function (win,fromkey) { 
		sl.debug("showMessage...");
		base.showDeck(win,fromkey,messageDeck);
	},
	
	showDeck : function(win,fromkey,index)  {
		if (fromkey && ! seb.DEBUG) { return; }
		let w = (win) ? win : base.getRecentWin();
		//sl.debug("showContent..." + base.getWinType(w));
		base.setDeckIndex(w,index);
		try {
			w.document.title = w.content.document.title;
		}
		catch(e) {}
		w.focus();
		w.XulLibBrowser.focus();
	},
	
	getDeck : function (win) {
		let w = (win) ? win : base.getRecentWin();
		return w.document.getElementById("deckContents");
	},
	
	getDeckIndex : function (win) {
		let w = (win) ? win : base.getRecentWin();
		return base.getDeck(win).selectedIndex;
	},
	
	setDeckIndex : function (win,index) {
		let w = (win) ? win : base.getRecentWin();
		base.getDeck(win).selectedIndex = index;
	},
	
	getFrameElement : function (win) {
		let w = (win) ? win : base.getRecentWin();
		return w.document.getElementById(xulFrame);
	},
	
	setMainScreen : function() {
		if (base.mainScreen['initialized']) { return base.mainScreen; }	 
		base.mainScreen['titlebarEnabled'] = su.getConfig("sebMainBrowserWindowTitlebarEnabled","boolean",false);
		base.mainScreen['maximized'] = su.getConfig("sebMainBrowserWindowMaximized","boolean",true);
		//template browserViewMode
		switch (su.getConfig("browserViewMode","number",1)) {
			case 0 :
				base.mainScreen['titlebarEnabled'] = true;
				base.mainScreen['maximized'] = false;
				break;
			case 1 :
				base.mainScreen['titlebarEnabled'] = false;
				base.mainScreen['maximized'] = true;
				break;
			break;
		}
		base.mainScreen['width'] = seb.config["mainBrowserWindowWidth"];
		base.mainScreen['height'] = seb.config["mainBrowserWindowHeight"];
		base.mainScreen['position'] = pos[su.getConfig("mainBrowserWindowPositioning","number",1)];
		if (su.getConfig("touchOptimized","boolean",true)) {
			base.mainScreen['titlebarEnabled'] = false;
			base.mainScreen['maximized'] = true;
		}
		base.mainScreen['initialized'] = true;
		return base.mainScreen;
	},
	
	setPopupScreen : function() {
		if (base.popupScreen['initialized']) { return base.popupScreen; }
		base.popupScreen['titlebarEnabled'] = su.getConfig("sebNewBrowserWindowByLinkTitlebarEnabled","boolean",true);
		base.popupScreen['maximized'] = su.getConfig("sebNewBrowserWindowByLinkMaximized","boolean",false);
		base.popupScreen['width'] = seb.config["newBrowserWindowByLinkWidth"];
		base.popupScreen['height'] = seb.config["newBrowserWindowByLinkHeight"];
		base.popupScreen['position'] = pos[su.getConfig("newBrowserWindowByLinkPositioning","number",0)];
		if (su.getConfig("touchOptimized","boolean",true)) {
			base.popupScreen['titlebarEnabled'] = false;
			base.popupScreen['maximized'] = true;
			
		}
		base.popupScreen['initialized'] = true;
		return base.popupScreen;	
	},
	
	setSize : function(win) {
		let scr = (base.getWinType(win) == "main") ? base.setMainScreen() : base.setPopupScreen();
		base.setTitlebar(win,scr);
		if (scr.maximized) {
			return;
		}
		
		sl.debug("setSize: " + base.getWinType(win));
		sl.debug("size screen: " + JSON.stringify(scr));
		let swt = seb.mainWin.screen.width;
		let sht = seb.mainWin.screen.height;
		let stp = seb.mainWin.screen.top;
		let slt = seb.mainWin.screen.left;
		
		sl.debug("screenWidth: " + swt);
		sl.debug("screenHeight: " + sht);
		sl.debug("screenTop: " + stp);
		sl.debug("screenLeft: " + slt);
		
		let sawt = seb.mainWin.screen.availWidth;
		let saht = seb.mainWin.screen.availHeight;
		let satp = seb.mainWin.screen.availTop;
		let salt = seb.mainWin.screen.availLeft;
		
		sl.debug("screenAvailWidth: " + sawt);
		sl.debug("screenAvailHeight: " + saht);
		sl.debug("screenAvailTop: " + satp);
		sl.debug("screenAvailLeft: " + salt);
		
		let wow = win.outerWidth;
		let wiw = win.innerWidth;
		let woh = win.outerHeight;
		let wih = win.innerHeight;
		
		sl.debug("winOuterWidth: " + wow);
		sl.debug("winInnerWidth: " + wiw);
		sl.debug("winOuterHeight: " + woh);
		sl.debug("winInnerHeight: " + wih);
		
		let wsx = win.screenX;
		let wsy = win.screenY;
		
		sl.debug("winScreenX: " + wsx);
		sl.debug("winScreenY: " + wsy);
		
		let offWidth = win.outerWidth - win.innerWidth;
		let offHeight = win.outerHeight - win.innerHeight;
		sl.debug("offWidth: " + offWidth);
		sl.debug("offHeight: " + offHeight);
		//let offWidth = 0;
		//let offHeight = 0;
		
		let tb = su.getConfig("showTaskBar","boolean",false);
		sl.debug("showTaskBar:" + tb);
		
		if (tb) {
			let defaultTbh = (sht - saht);
			let tbh = su.getConfig("taskBarHeight","number",defaultTbh);
			tbh = (tbh > 0) ? tbh : defaultTbh;
			sht -= tbh;
			sl.debug("showTaskBar: change height to " + sht);
		}
		
		let wx = swt;
		let hx = sht;
		if (typeof scr.width == "string" && /^\d+\%$/.test(scr.width)) {
			let w = scr.width.replace("%","");
			wx = (w > 0) ? ((swt / 100) * w) : swt;
		}
		else {
			wx = (scr.width > 0) ? scr.width : swt;
		}
		sl.debug("wx: " + wx);
		
		if (typeof scr.height == "string" && /^\d+\%$/.test(scr.height)) {
			var h = scr.height.replace("%","");
			hx = (h > 0) ? ((sht / 100) * h) : sht;	
		}
		else {
			hx = (scr.height > 0) ? scr.height : sht;
		}
		sl.debug("hx: " + hx);
		
		if (su.getConfig("browserViewMode","number",1) == 0) {
			wx -= sh.getFrameWidth();
			hx -= sh.getFrameHeight();
		}
		
		sl.debug("resizeTo: " + wx + ":" + hx);
		win.setTimeout(function() { this.resizeTo(wx,hx); }, 100);
		
		//setPosition(win);
		win.setTimeout(function () { setPosition(this) }, 500 );
		
		function setPosition(win) {
			sl.debug("setPosition: " + scr.position);
			switch (scr.position) {
				case "center" :
					//sl.debug();
					sl.debug("moveTo: " + ((swt/2)-(wx/2)) + ":" + satp);
					win.moveTo(((swt/2)-(wx/2)),satp);
					break;
				case "right" :
					sl.debug("moveTo: " + (swt-wx) + ":" + satp);
					win.moveTo((swt-wx),satp);
					break;
				case "left" :
					sl.debug("moveTo: " + salt + ":" + satp);
					win.moveTo(salt,satp);
					break;
				default :
					// do nothing
			}
		}
	},
	
	setTitlebar : function (win,scr) {
		sl.debug("setTitlebar");
		let attr = "";
		let val = "";
		let sebwin = win.document.getElementById("sebWindow");
		let loadbox = win.document.getElementById("loadingBox");
		let tb = win.document.getElementById("toolBar");
		sl.debug("titlebarEnabled: " + scr.titlebarEnabled);
		switch (sh.os) {
			case "WINNT" :
				if (!scr.titlebarEnabled) {
					sebwin.setAttribute("chromemargin","0,-1,-1,-1");
					sebwin.classList.add("winHiddenChromeMargin");
					loadbox.style.top = "10px";
					tb.style.marginTop = "2px";
				}
				break;
			case "DARWIN" : // maybe the best would be hidechrome and resizing
				if (!scr.titlebarEnabled) {
					sebwin.setAttribute("chromemargin","0,-1,-1,-1");
				}
				break;
			case "UNIX" :
			case "LINUX" :
				attr = "hidechrome";
				val = (!scr.titlebarEnabled);
				sebwin.setAttribute(attr,val);
				break;
			default :
				sl.err("Unknown OS: " + sh.os);
		}
		//win.setTimeout(function() { this.maximize(); },1);
	},
	
	hostDisplaySettingsChanged : function () {
		sl.debug("host display settings changed");
		for (var i=0;i<base.wins.length;i++) {
			base.setSize(base.wins[i]);
		}
	}
}
