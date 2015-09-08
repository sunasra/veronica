/*============================
Author : Prateek Bhatnagar
Data : 7th-Sept-2015
Description : This facilitates the router of the framework
=============================*/
;
(function(gems, veronica) {
    var appStatus = {}

    appStatus.viewTag = $(veronica.settings.viewTag)[0];
    if (appStatus.viewTag) {
        appStatus.viewTag.innerHTML = "<div class='page'></div>";
        appStatus.pageTag = appStatus.viewTag.querySelector(".page");
    }
    else{
    	appStatus.pageTag=null;
    }

    appStatus.routes = [];

    appStatus.currentState = {
        name: "",
        state: {}
    };

    appStatus.currentComponent = null;

    function createRoute(stateName, urlRegex, componentToMount, preserveDateOnUnmount) {
        return {
            url: urlRegex,
            state: stateName,
            component: componentToMount,
            preserveDateOnUnmount: preserveDateOnUnmount || false
        };
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
            //handle special case of home in which case giving / for route is much more intuitive.
            if (route.url === "/") {
                route.url = "\/$";
            }
            appStatus.routes.push(route);
        } else {
            throw new Error("Route object should contain a URL regex and a component name");
        }
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

                    //check if route matches and is not the current route
                    if (newRoute.match(route.url) && (appStatus.currentState.name !== route.state)) {
                        if (appStatus.currentState.name === "") {
                            history.replaceState(route, "", newRoute);
                        } else {
                            route.prevPage = currRoute;
                            history.pushState(route, "", newRoute);
                        }
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
                        urlFound = true;
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

    window.onpopstate = function(e) {
        // if(e) because veronica shouldn't intrupt the #changes
        if (e && e.state) {
            if (appStatus.currentState.state.state !== e.state.state) {
                gems.Dispatcher.trigger("veronica:stateChange", e.state);
            }
            evalRoute(e.state, "mounting-pop", "unmount-pop");
        }
    };

    function evalRoute(stateObj, pageEnterEffect, pageLeaveEffect) {
        // declare components and states
        if (stateObj === null) {
            return;
        }

        var componentName = stateObj.component;
        var prevState = appStatus.currentState;
        var preserveComponentData = false;

        //check if data of this component is to be preserved
        if (prevState && prevState.state && prevState.state.preserveDateOnUnmount) {
            preserveComponentData = prevState.state.preserveDateOnUnmount;
        }

        //initialize current state and component
        appStatus.currentState.name = stateObj.state;
        appStatus.currentState.state = stateObj;
        appStatus.currentComponent = document.createElement(componentName);


        mountNewPage(pageEnterEffect, pageLeaveEffect);

        riot.mount(componentName, {});
    }

    function mountNewPage(pageEnterEffect, pageLeaveEffect) {
        pageEnterEffect = pageEnterEffect || "mounting";
        pageLeaveEffect = pageLeaveEffect || "unmount";

        if (appStatus.viewTag) {
            //if there is already something in current page
            if (appStatus.pageTag.children.length > 0) {
                var elem = document.createElement("div");
                var shownEventFired = false;
                elem.className = "page " + appStatus.currentComponent.tagName.toLowerCase();
                elem.appendChild(appStatus.currentComponent);

                appStatus.pageTag.addEventListener("webkitTransitionEnd", function() {
                    animEndCallback(this, elem);
                    shownEventFired = true;
                    appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
                });

                appStatus.pageTag.addEventListener("oTransitionEnd", function() {
                    animEndCallback(this, elem);
                    shownEventFired = true;
                    appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
                });

                appStatus.pageTag.addEventListener("transitionend", function() {
                    animEndCallback(this, elem);
                    shownEventFired = true;
                    appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
                });

                setTimeout(function() {
                    if (!shownEventFired) {
                        animEndCallback(appStatus.pageTag,elem)
                        appStatus.currentComponent.dispatchEvent(gems.capabilities.createEvent("shown"));
                    }
                }, veronica.settings.maxPageTransitionTime);

                if (globals.BROWSER_SUPPORT === "A") {
                    elem.classList.add(pageEnterEffect);
                    appStatus.pageTag.classList.add(pageLeaveEffect);
                    appStatus.viewTag.appendChild(elem);

                } else {
                    var newComponent = appStatus.currentComponent.tagName.toLowerCase();
                    var newTag = "<div class='page " + newComponent + "'>" + "<" + newComponent + "></" + newComponent + ">" + "</div>";
                    appStatus.pageTag.innerHTML = newTag;
                }



            } else {
                //if this is the first time a page is being mounted
                appStatus.pageTag.classList.add(appStatus.currentComponent.tagName.toLowerCase());
                appStatus.pageTag.appendChild(appStatus.currentComponent);
            }
        }
    }

    function animEndCallback(currElem, newPage) {
        currElem.className = "hidden";
        currElem.remove();
        newPage.className = "page " + appStatus.currentComponent.tagName.toLowerCase();
        appStatus.pageTag = newPage;
    }

    function getPrevPageUrl() {
        if (history.state) {
            return history.state.prevPage || null;
        } else {
            return null;
        }

    }

    veronica.createRoute = createRoute;
    veronica.getCurrentPath = getCurrentPath;
    veronica.getPrevPageUrl = getPrevPageUrl;
    veronica.addRoute = addRoute;
    veronica.loc = loc;
    gems.totalRouteLength = function(){return appStatus.routes.length};

})(gems, veronica);