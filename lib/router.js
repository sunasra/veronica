/*============================
Author : Prateek Bhatnagar
Data : 7th-Sept-2015
Description : This facilitates the router of the framework
=============================*/
;
(function(gems, veronica) {
    var appStatus = {
        shownEventFired: false,
        mountingComponent: null
    }

    appStatus.viewTag = $(veronica.settings.viewTag)[0];
    if (appStatus.viewTag) {
        appStatus.viewTag.innerHTML = "<div class='page'></div>";
        appStatus.pageTag = appStatus.viewTag.querySelector(".page");
    } else {
        appStatus.pageTag = null;
    }

    appStatus.routes = [];

    appStatus.currentState = {
        name: "",
        state: {}
    };

    appStatus.currentComponent = null;

    function createRoute(stateName, urlRegex, componentToMount) {
        return {
            url: urlRegex,
            state: stateName,
            component: componentToMount
        };
    }

    function getCurrentState() {
        return appStatus.currentState.state;
    }

    function getCurrentPath() {
        var route = location.pathname.split("#")[0];
        if (typeof route === "string") {
            return route;
        } else if (route.length > 0) {
            return route[0];
        } else {
            throw new Error("Unable to process route");
        }
    }

    function addRoute(route) {
        if (route && route.url && route.component) {
            var tokenRegExp = /:([A-Za-z0-9]*)$|:(([A-Za-z0-9]*)\/)/g;
            var params = route.url.match(tokenRegExp);
            var urlregex = route.url;
            if (params) {
                for (var paramIndex = 0; paramIndex < params.length; paramIndex++) {
                    params[paramIndex] = params[paramIndex].replace("/", "");
                    urlregex = urlregex.replace(params[paramIndex], "(.*)");
                }
            }
            route.regex = new RegExp("^" + urlregex + "$", "i");
            route.paramDictionary = params;

            appStatus.routes.push(route);
        } else {
            throw new Error("Route object should contain a URL regex and a component name");
        }
    }

    function extractRouteData(regex, paramDictionary, url) {
        if (!paramDictionary || paramDictionary.length === 0) {
            return {};
        }

        var data = url.match(regex);
        var routeData = {};
        data.shift();

        for (var pdIndex = 0; pdIndex < paramDictionary.length; pdIndex++) {
            routeData[paramDictionary[pdIndex]] = data[pdIndex];
        }

        return routeData;
    }

    function loc() {
        if (arguments.length === 0) {
            return appStatus.currentState;
        } else if (arguments.length > 0 && typeof(arguments[0]) == "string") {
            var newRoute = arguments[0];
            var currRoute = getCurrentPath();
            if (history && history.pushState) {
                var urlFound = false;
                for (var r in appStatus.routes) {
                    var route = appStatus.routes[r];
                    var currRouteRegex = route.regex;
                    //check if route matches and is not the current route
                    if (currRouteRegex.test(newRoute) && (appStatus.currentState.name !== route.state)) {
                        route.data = extractRouteData(currRouteRegex, route.paramDictionary, newRoute);
                        var routeData = {};
                        routeData.component = route.component;
                        routeData.data = route.data;
                        routeData.url = route.url;
                        routeData.state = route.state;

                        if (appStatus.currentState.name === "") {
                            history.replaceState(routeData, "", newRoute);
                        } else {
                            route.prevPage = currRoute;
                            if (arguments[1] && typeof(arguments[1]) == "boolean" && arguments[1] === true) {
                                history.replaceState(routeData, "", newRoute);
                            } else {
                                history.pushState(routeData, "", newRoute);
                            }
                        }
                        urlFound = true;
                        gems.Dispatcher.trigger("veronica:stateChange", route);
                        var pageEnterEffect = "mounting";
                        var pageLeaveEffect = "unmount";
                        if (arguments[1] && typeof(arguments[1]) == "string") {
                            pageEnterEffect = arguments[1];
                        }
                        if (arguments[2] && typeof(arguments[2]) == "string") {
                            pageLeaveEffect = arguments[2];
                        }
                        evalRoute(route, pageEnterEffect, pageLeaveEffect);
                        break;
                    }
                }
                //current web app does not have this route so send this request to Server
                if (!urlFound) {
                    location.href = newRoute;
                }
            } else {
                if (newRoute !== currRoute) {
                    location.href = newRoute;
                }
            }
        }
    }

    function replaceLoc(url) {
        loc(url, true);
    }

    window.addEventListener("popstate", function(e) {
        if (veronica.settings.listenPopState && e && e.state) {
            if (appStatus.currentState.state.state !== e.state.state) {
                gems.Dispatcher.trigger("veronica:stateChange", e.state);
            }
            evalRoute(e.state, "mounting-pop", "unmount-pop");
        }
    });

    function evalRoute(stateObj, pageEnterEffect, pageLeaveEffect) {
        // declare components and states
        if (stateObj === null) {
            return;
        }

        var componentName = stateObj.component;
        var prevState = appStatus.currentState;


        //initialize current state and component
        appStatus.currentState.name = stateObj.state;
        appStatus.currentState.state = stateObj;
        appStatus.currentComponent = document.createElement(componentName);


        mountNewPage(pageEnterEffect, pageLeaveEffect);

        var tag = riot.mount(componentName, {});

    }

    function mountNewPage(pageEnterEffect, pageLeaveEffect) {
        pageEnterEffect = pageEnterEffect || "mounting";
        pageLeaveEffect = pageLeaveEffect || "unmount";

        if (appStatus.viewTag) {
            //if there is already something in current page
            if (appStatus.pageTag.children.length > 0) {
                var elem = document.createElement("div");
                appStatus.shownEventFired = false;
                elem.className = "page " + appStatus.currentComponent.tagName.toLowerCase();
                elem.appendChild(appStatus.currentComponent);

                appStatus.mountingComponent = elem;

                if (veronica.settings.enablePageTransitions) {
                    appStatus.pageTag.addEventListener("webkitTransitionEnd", transEnd);
                    appStatus.pageTag.addEventListener("oTransitionEnd", transEnd);
                    appStatus.pageTag.addEventListener("transitionend", transEnd);
                }

                setTimeout(function() {
                    if (!appStatus.shownEventFired) {
                        animEndCallback(appStatus.pageTag, elem)
                        appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
                    }
                }, veronica.settings.maxPageTransitionTime);

                if (globals.BROWSER_SUPPORT === "A" && veronica.settings.enablePageTransitions) {
                    elem.classList.add(pageEnterEffect);
                    appStatus.pageTag.classList.add(pageLeaveEffect);
                    appStatus.viewTag.appendChild(elem);

                } else {
                    var page = appStatus.viewTag.children && appStatus.viewTag.children[0];
                    var tag = page && page.children && page.children[0];
                    if (tag._tag && tag._tag.isMounted) {
                        tag._tag.unmount()
                    }

                    var newComponent = appStatus.currentComponent.tagName.toLowerCase();
                    var newTag = "<div class='page " + newComponent + "'>" + "<" + newComponent + "></" + newComponent + ">" + "</div>";

                    appStatus.viewTag.innerHTML = newTag;
                }
            } else {
                //if this is the first time a page is being mounted
                appStatus.pageTag.classList.add(appStatus.currentComponent.tagName.toLowerCase());
                appStatus.pageTag.appendChild(appStatus.currentComponent);
                gems.Dispatcher.trigger("veronica:stateTransitionComplete", appStatus.currentState.state);
            }
        }
    }

    function transEnd(elem) {
        this.removeEventListener("transitionend", transEnd);
        this.removeEventListener("webkitTransitionEnd", transEnd);
        this.removeEventListener("oTransitionEnd", transEnd);
        animEndCallback(this, appStatus.mountingComponent);
        appStatus.shownEventFired = true;
        appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
    }

    function animEndCallback(currElem, newPage) {
        currElem.className = "hidden";

        removePrevComponents(newPage);

        newPage.className = "page " + appStatus.currentComponent.tagName.toLowerCase();
        appStatus.pageTag = newPage;
        gems.Dispatcher.trigger("veronica:stateTransitionComplete", appStatus.currentState.state);
    }

    function getPrevPageUrl() {
        if (history.state) {
            return history.state.prevPage || null;
        } else {
            return null;
        }

    }

    function removePrevComponents(currComponent) {
        var viewTags = appStatus.viewTag.childNodes;
        var tegRemovalIndex = 0;
        while (viewTags.length > 1) {
            var currTag = viewTags[tegRemovalIndex];
            var currPage = currTag.childNodes[0];
            if (currTag !== currComponent) {
                if (currTag.remove) {
                    currTag.remove();
                } else if (currTag.parentElement) {
                    currTag.parentElement.removeChild(currTag);
                }
            } else {
                tegRemovalIndex = tegRemovalIndex + 1;
            }
        }
    }

    veronica.createRoute = createRoute;
    veronica.getCurrentPath = getCurrentPath;
    veronica.getCurrentState = getCurrentState;
    veronica.getPrevPageUrl = getPrevPageUrl;
    veronica.addRoute = addRoute;
    veronica.loc = loc;
    gems.totalRouteLength = function() {
        return appStatus.routes.length
    };

})(gems, veronica);
