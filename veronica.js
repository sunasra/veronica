/* Riot v2.2.4, @license MIT, (c) 2015 Muut Inc. + contributors */

;(function(window, undefined) {
  'use strict';
var riot = { version: 'v2.2.4', settings: {} },
  //// be aware, internal usage

  // counter to give a unique id to all the Tag instances
  __uid = 0,

  // riot specific prefixes
  RIOT_PREFIX = 'riot-',
  RIOT_TAG = RIOT_PREFIX + 'tag',

  // for typeof == '' comparisons
  T_STRING = 'string',
  T_OBJECT = 'object',
  T_UNDEF  = 'undefined',
  T_FUNCTION = 'function',
  // special native tags that cannot be treated like the others
  SPECIAL_TAGS_REGEX = /^(?:opt(ion|group)|tbody|col|t[rhd])$/,
  RESERVED_WORDS_BLACKLIST = ['_item', '_id', 'update', 'root', 'mount', 'unmount', 'mixin', 'isMounted', 'isLoop', 'tags', 'parent', 'opts', 'trigger', 'on', 'off', 'one'],

  // version# for IE 8-11, 0 for others
  IE_VERSION = (window && window.document || {}).documentMode | 0,

  // Array.isArray for IE8 is in the polyfills
  isArray = Array.isArray

riot.observable = function(el) {

  el = el || {}

  var callbacks = {},
      _id = 0

  el.on = function(events, fn) {
    if (isFunction(fn)) {
      if (typeof fn.id === T_UNDEF) fn._id = _id++

      events.replace(/\S+/g, function(name, pos) {
        (callbacks[name] = callbacks[name] || []).push(fn)
        fn.typed = pos > 0
      })
    }
    return el
  }

  el.off = function(events, fn) {
    if (events == '*') callbacks = {}
    else {
      events.replace(/\S+/g, function(name) {
        if (fn) {
          var arr = callbacks[name]
          for (var i = 0, cb; (cb = arr && arr[i]); ++i) {
            if (cb._id == fn._id) arr.splice(i--, 1)
          }
        } else {
          callbacks[name] = []
        }
      })
    }
    return el
  }

  // only single event supported
  el.one = function(name, fn) {
    function on() {
      el.off(name, on)
      fn.apply(el, arguments)
    }
    return el.on(name, on)
  }

  el.trigger = function(name) {
    var args = [].slice.call(arguments, 1),
        fns = callbacks[name] || []

    for (var i = 0, fn; (fn = fns[i]); ++i) {
      if (!fn.busy) {
        fn.busy = 1
        fn.apply(el, fn.typed ? [name].concat(args) : args)
        if (fns[i] !== fn) { i-- }
        fn.busy = 0
      }
    }

    if (callbacks.all && name != 'all') {
      el.trigger.apply(el, ['all', name].concat(args))
    }

    return el
  }

  return el

}
riot.mixin = (function() {
  var mixins = {}

  return function(name, mixin) {
    if (!mixin) return mixins[name]
    mixins[name] = mixin
  }

})()

;(function(riot, evt, win) {

  // browsers only
  if (!win) return

  var loc = win.location,
      fns = riot.observable(),
      started = false,
      current

  function hash() {
    return loc.href.split('#')[1] || ''   // why not loc.hash.splice(1) ?
  }

  function parser(path) {
    return path.split('/')
  }

  function emit(path) {
    if (path.type) path = hash()

    if (path != current) {
      fns.trigger.apply(null, ['H'].concat(parser(path)))
      current = path
    }
  }

  var r = riot.route = function(arg) {
    // string
    if (arg[0]) {
      loc.hash = arg
      emit(arg)

    // function
    } else {
      fns.on('H', arg)
    }
  }

  r.exec = function(fn) {
    fn.apply(null, parser(hash()))
  }

  r.parser = function(fn) {
    parser = fn
  }

  r.stop = function () {
    if (started) {
      if (win.removeEventListener) win.removeEventListener(evt, emit, false) //@IE8 - the if()
      else win.detachEvent('on' + evt, emit) //@IE8
      fns.off('*')
      started = false
    }
  }

  r.start = function () {
    if (!started) {
      if (win.addEventListener) win.addEventListener(evt, emit, false) //@IE8 - the if()
      else win.attachEvent('on' + evt, emit) //IE8
      started = true
    }
  }

  // autostart the router
  r.start()

})(riot, 'hashchange', window)
/*

//// How it works?


Three ways:

1. Expressions: tmpl('{ value }', data).
   Returns the result of evaluated expression as a raw object.

2. Templates: tmpl('Hi { name } { surname }', data).
   Returns a string with evaluated expressions.

3. Filters: tmpl('{ show: !done, highlight: active }', data).
   Returns a space separated list of trueish keys (mainly
   used for setting html classes), e.g. "show highlight".


// Template examples

tmpl('{ title || "Untitled" }', data)
tmpl('Results are { results ? "ready" : "loading" }', data)
tmpl('Today is { new Date() }', data)
tmpl('{ message.length > 140 && "Message is too long" }', data)
tmpl('This item got { Math.round(rating) } stars', data)
tmpl('<h1>{ title }</h1>{ body }', data)


// Falsy expressions in templates

In templates (as opposed to single expressions) all falsy values
except zero (undefined/null/false) will default to empty string:

tmpl('{ undefined } - { false } - { null } - { 0 }', {})
// will return: " - - - 0"

*/


var brackets = (function(orig) {

  var cachedBrackets,
      r,
      b,
      re = /[{}]/g

  return function(x) {

    // make sure we use the current setting
    var s = riot.settings.brackets || orig

    // recreate cached vars if needed
    if (cachedBrackets !== s) {
      cachedBrackets = s
      b = s.split(' ')
      r = b.map(function (e) { return e.replace(/(?=.)/g, '\\') })
    }

    // if regexp given, rewrite it with current brackets (only if differ from default)
    return x instanceof RegExp ? (
        s === orig ? x :
        new RegExp(x.source.replace(re, function(b) { return r[~~(b === '}')] }), x.global ? 'g' : '')
      ) :
      // else, get specific bracket
      b[x]
  }
})('{ }')


var tmpl = (function() {

  var cache = {},
      OGLOB = '"in d?d:' + (window ? 'window).' : 'global).'),
      reVars =
      /(['"\/])(?:[^\\]*?|\\.|.)*?\1|\.\w*|\w*:|\b(?:(?:new|typeof|in|instanceof) |(?:this|true|false|null|undefined)\b|function\s*\()|([A-Za-z_$]\w*)/g

  // build a template (or get it from cache), render with data
  return function(str, data) {
    return str && (cache[str] || (cache[str] = tmpl(str)))(data)
  }


  // create a template instance

  function tmpl(s, p) {

    if (s.indexOf(brackets(0)) < 0) {
      // return raw text
      s = s.replace(/\n|\r\n?/g, '\n')
      return function () { return s }
    }

    // temporarily convert \{ and \} to a non-character
    s = s
      .replace(brackets(/\\{/g), '\uFFF0')
      .replace(brackets(/\\}/g), '\uFFF1')

    // split string to expression and non-expresion parts
    p = split(s, extract(s, brackets(/{/), brackets(/}/)))

    // is it a single expression or a template? i.e. {x} or <b>{x}</b>
    s = (p.length === 2 && !p[0]) ?

      // if expression, evaluate it
      expr(p[1]) :

      // if template, evaluate all expressions in it
      '[' + p.map(function(s, i) {

        // is it an expression or a string (every second part is an expression)
        return i % 2 ?

          // evaluate the expressions
          expr(s, true) :

          // process string parts of the template:
          '"' + s

            // preserve new lines
            .replace(/\n|\r\n?/g, '\\n')

            // escape quotes
            .replace(/"/g, '\\"') +

          '"'

      }).join(',') + '].join("")'

    return new Function('d', 'return ' + s
      // bring escaped { and } back
      .replace(/\uFFF0/g, brackets(0))
      .replace(/\uFFF1/g, brackets(1)) + ';')

  }


  // parse { ... } expression

  function expr(s, n) {
    s = s

      // convert new lines to spaces
      .replace(/\n|\r\n?/g, ' ')

      // trim whitespace, brackets, strip comments
      .replace(brackets(/^[{ ]+|[ }]+$|\/\*.+?\*\//g), '')

    // is it an object literal? i.e. { key : value }
    return /^\s*[\w- "']+ *:/.test(s) ?

      // if object literal, return trueish keys
      // e.g.: { show: isOpen(), done: item.done } -> "show done"
      '[' +

          // extract key:val pairs, ignoring any nested objects
          extract(s,

              // name part: name:, "name":, 'name':, name :
              /["' ]*[\w- ]+["' ]*:/,

              // expression part: everything upto a comma followed by a name (see above) or end of line
              /,(?=["' ]*[\w- ]+["' ]*:)|}|$/
              ).map(function(pair) {

                // get key, val parts
                return pair.replace(/^[ "']*(.+?)[ "']*: *(.+?),? *$/, function(_, k, v) {

                  // wrap all conditional parts to ignore errors
                  return v.replace(/[^&|=!><]+/g, wrap) + '?"' + k + '":"",'

                })

              }).join('') +

        '].join(" ").trim()' :

      // if js expression, evaluate as javascript
      wrap(s, n)

  }


  // execute js w/o breaking on errors or undefined vars

  function wrap(s, nonull) {
    s = s.trim()
    return !s ? '' : '(function(v){try{v=' +

      // prefix vars (name => data.name)
      s.replace(reVars, function(s, _, v) { return v ? '(("' + v + OGLOB + v + ')' : s }) +

      // default to empty string for falsy values except zero
      '}catch(e){}return ' + (nonull === true ? '!v&&v!==0?"":v' : 'v') + '}).call(d)'
  }


  // split string by an array of substrings

  function split(str, substrings) {
    var parts = []
    substrings.map(function(sub, i) {

      // push matched expression and part before it
      i = str.indexOf(sub)
      parts.push(str.slice(0, i), sub)
      str = str.slice(i + sub.length)
    })
    if (str) parts.push(str)

    // push the remaining part
    return parts
  }


  // match strings between opening and closing regexp, skipping any inner/nested matches

  function extract(str, open, close) {

    var start,
        level = 0,
        matches = [],
        re = new RegExp('(' + open.source + ')|(' + close.source + ')', 'g')

    str.replace(re, function(_, open, close, pos) {

      // if outer inner bracket, mark position
      if (!level && open) start = pos

      // in(de)crease bracket level
      level += open ? 1 : -1

      // if outer closing bracket, grab the match
      if (!level && close != null) matches.push(str.slice(start, pos + close.length))

    })

    return matches
  }

})()

/*
  lib/browser/tag/mkdom.js

  Includes hacks needed for the Internet Explorer version 9 and bellow

*/
// http://kangax.github.io/compat-table/es5/#ie8
// http://codeplanet.io/dropping-ie8/

var mkdom = (function (checkIE) {

  var rootEls = {
        'tr': 'tbody',
        'th': 'tr',
        'td': 'tr',
        'tbody': 'table',
        'col': 'colgroup'
      },
      GENERIC = 'div'

  checkIE = checkIE && checkIE < 10

  // creates any dom element in a div, table, or colgroup container
  function _mkdom(html) {

    var match = html && html.match(/^\s*<([-\w]+)/),
        tagName = match && match[1].toLowerCase(),
        rootTag = rootEls[tagName] || GENERIC,
        el = mkEl(rootTag)

    el.stub = true

    if (checkIE && tagName && (match = tagName.match(SPECIAL_TAGS_REGEX)))
      ie9elem(el, html, tagName, !!match[1])
    else
      el.innerHTML = html

    return el
  }

  // creates tr, th, td, option, optgroup element for IE8-9
  /* istanbul ignore next */
  function ie9elem(el, html, tagName, select) {

    var div = mkEl(GENERIC),
        tag = select ? 'select>' : 'table>',
        child

    div.innerHTML = '<' + tag + html + '</' + tag

    child = div.getElementsByTagName(tagName)[0]
    if (child)
      el.appendChild(child)

  }
  // end ie9elem()

  return _mkdom

})(IE_VERSION)

// { key, i in items} -> { key, i, items }
function loopKeys(expr) {
  var b0 = brackets(0),
      els = expr.trim().slice(b0.length).match(/^\s*(\S+?)\s*(?:,\s*(\S+))?\s+in\s+(.+)$/)
  return els ? { key: els[1], pos: els[2], val: b0 + els[3] } : { val: expr }
}

function mkitem(expr, key, val) {
  var item = {}
  item[expr.key] = key
  if (expr.pos) item[expr.pos] = val
  return item
}


/* Beware: heavy stuff */
function _each(dom, parent, expr) {

  remAttr(dom, 'each')

  var tagName = getTagName(dom),
      template = dom.outerHTML,
      hasImpl = !!tagImpl[tagName],
      impl = tagImpl[tagName] || {
        tmpl: template
      },
      root = dom.parentNode,
      placeholder = document.createComment('riot placeholder'),
      tags = [],
      child = getTag(dom),
      checksum

  root.insertBefore(placeholder, dom)

  expr = loopKeys(expr)

  // clean template code
  parent
    .one('premount', function () {
      if (root.stub) root = parent.root
      // remove the original DOM node
      dom.parentNode.removeChild(dom)
    })
    .on('update', function () {
      var items = tmpl(expr.val, parent)

      // object loop. any changes cause full redraw
      if (!isArray(items)) {

        checksum = items ? JSON.stringify(items) : ''

        items = !items ? [] :
          Object.keys(items).map(function (key) {
            return mkitem(expr, key, items[key])
          })
      }

      var frag = document.createDocumentFragment(),
          i = tags.length,
          j = items.length

      // unmount leftover items
      while (i > j) {
        tags[--i].unmount()
        tags.splice(i, 1)
      }

      for (i = 0; i < j; ++i) {
        var _item = !checksum && !!expr.key ? mkitem(expr, items[i], i) : items[i]

        if (!tags[i]) {
          // mount new
          (tags[i] = new Tag(impl, {
              parent: parent,
              isLoop: true,
              hasImpl: hasImpl,
              root: SPECIAL_TAGS_REGEX.test(tagName) ? root : dom.cloneNode(),
              item: _item
            }, dom.innerHTML)
          ).mount()

          frag.appendChild(tags[i].root)
        } else
          tags[i].update(_item)

        tags[i]._item = _item

      }

      root.insertBefore(frag, placeholder)

      if (child) parent.tags[tagName] = tags

    }).one('updated', function() {
      var keys = Object.keys(parent)// only set new values
      walk(root, function(node) {
        // only set element node and not isLoop
        if (node.nodeType == 1 && !node.isLoop && !node._looped) {
          node._visited = false // reset _visited for loop node
          node._looped = true // avoid set multiple each
          setNamed(node, parent, keys)
        }
      })
    })

}


function parseNamedElements(root, tag, childTags) {

  walk(root, function(dom) {
    if (dom.nodeType == 1) {
      dom.isLoop = dom.isLoop || (dom.parentNode && dom.parentNode.isLoop || dom.getAttribute('each')) ? 1 : 0

      // custom child tag
      var child = getTag(dom)

      if (child && !dom.isLoop) {
        childTags.push(initChildTag(child, dom, tag))
      }

      if (!dom.isLoop)
        setNamed(dom, tag, [])
    }

  })

}

function parseExpressions(root, tag, expressions) {

  function addExpr(dom, val, extra) {
    if (val.indexOf(brackets(0)) >= 0) {
      var expr = { dom: dom, expr: val }
      expressions.push(extend(expr, extra))
    }
  }

  walk(root, function(dom) {
    var type = dom.nodeType

    // text node
    if (type == 3 && dom.parentNode.tagName != 'STYLE') addExpr(dom, dom.nodeValue)
    if (type != 1) return

    /* element */

    // loop
    var attr = dom.getAttribute('each')

    if (attr) { _each(dom, tag, attr); return false }

    // attribute expressions
    each(dom.attributes, function(attr) {
      var name = attr.name,
        bool = name.split('__')[1]

      addExpr(dom, attr.value, { attr: bool || name, bool: bool })
      if (bool) { remAttr(dom, name); return false }

    })

    // skip custom tags
    if (getTag(dom)) return false

  })

}
function Tag(impl, conf, innerHTML) {

  var self = riot.observable(this),
      opts = inherit(conf.opts) || {},
      dom = mkdom(impl.tmpl),
      parent = conf.parent,
      isLoop = conf.isLoop,
      hasImpl = conf.hasImpl,
      item = cleanUpData(conf.item),
      expressions = [],
      childTags = [],
      root = conf.root,
      fn = impl.fn,
      tagName = root.tagName.toLowerCase(),
      attr = {},
      propsInSyncWithParent = []

  if (fn && root._tag) {
    root._tag.unmount(true)
  }

  // not yet mounted
  this.isMounted = false
  root.isLoop = isLoop

  // keep a reference to the tag just created
  // so we will be able to mount this tag multiple times
  root._tag = this

  // create a unique id to this tag
  // it could be handy to use it also to improve the virtual dom rendering speed
  this._id = __uid++

  extend(this, { parent: parent, root: root, opts: opts, tags: {} }, item)

  // grab attributes
  each(root.attributes, function(el) {
    var val = el.value
    // remember attributes with expressions only
    if (brackets(/{.*}/).test(val)) attr[el.name] = val
  })

  if (dom.innerHTML && !/^(select|optgroup|table|tbody|tr|col(?:group)?)$/.test(tagName))
    // replace all the yield tags with the tag inner html
    dom.innerHTML = replaceYield(dom.innerHTML, innerHTML)

  // options
  function updateOpts() {
    var ctx = hasImpl && isLoop ? self : parent || self

    // update opts from current DOM attributes
    each(root.attributes, function(el) {
      opts[el.name] = tmpl(el.value, ctx)
    })
    // recover those with expressions
    each(Object.keys(attr), function(name) {
      opts[name] = tmpl(attr[name], ctx)
    })
  }

  function normalizeData(data) {
    for (var key in item) {
      if (typeof self[key] !== T_UNDEF)
        self[key] = data[key]
    }
  }

  function inheritFromParent () {
    if (!self.parent || !isLoop) return
    each(Object.keys(self.parent), function(k) {
      // some properties must be always in sync with the parent tag
      var mustSync = !~RESERVED_WORDS_BLACKLIST.indexOf(k) && ~propsInSyncWithParent.indexOf(k)
      if (typeof self[k] === T_UNDEF || mustSync) {
        // track the property to keep in sync
        // so we can keep it updated
        if (!mustSync) propsInSyncWithParent.push(k)
        self[k] = self.parent[k]
      }
    })
  }

  this.update = function(data) {
    // make sure the data passed will not override
    // the component core methods
    data = cleanUpData(data)
    // inherit properties from the parent
    inheritFromParent()
    // normalize the tag properties in case an item object was initially passed
    if (data && typeof item === T_OBJECT) {
      normalizeData(data)
      item = data
    }
    extend(self, data)
    updateOpts()
    self.trigger('update', data)
    update(expressions, self)
    self.trigger('updated')
  }

  this.mixin = function() {
    each(arguments, function(mix) {
      mix = typeof mix === T_STRING ? riot.mixin(mix) : mix
      each(Object.keys(mix), function(key) {
        // bind methods to self
        if (key != 'init')
          self[key] = isFunction(mix[key]) ? mix[key].bind(self) : mix[key]
      })
      // init method will be called automatically
      if (mix.init) mix.init.bind(self)()
    })
  }

  this.mount = function() {

    updateOpts()

    // initialiation
    if (fn) fn.call(self, opts)

    // parse layout after init. fn may calculate args for nested custom tags
    parseExpressions(dom, self, expressions)

    // mount the child tags
    toggle(true)

    // update the root adding custom attributes coming from the compiler
    // it fixes also #1087
    if (impl.attrs || hasImpl) {
      walkAttributes(impl.attrs, function (k, v) { root.setAttribute(k, v) })
      parseExpressions(self.root, self, expressions)
    }

    if (!self.parent || isLoop) self.update(item)

    // internal use only, fixes #403
    self.trigger('premount')

    if (isLoop && !hasImpl) {
      // update the root attribute for the looped elements
      self.root = root = dom.firstChild

    } else {
      while (dom.firstChild) root.appendChild(dom.firstChild)
      if (root.stub) self.root = root = parent.root
    }
    // if it's not a child tag we can trigger its mount event
    if (!self.parent || self.parent.isMounted) {
      self.isMounted = true
      self.trigger('mount')
    }
    // otherwise we need to wait that the parent event gets triggered
    else self.parent.one('mount', function() {
      // avoid to trigger the `mount` event for the tags
      // not visible included in an if statement
      if (!isInStub(self.root)) {
        self.parent.isMounted = self.isMounted = true
        self.trigger('mount')
      }
    })
  }


  this.unmount = function(keepRootTag) {
    var el = root,
        p = el.parentNode,
        ptag

    if (p) {

      if (parent) {
        ptag = getImmediateCustomParentTag(parent)
        // remove this tag from the parent tags object
        // if there are multiple nested tags with same name..
        // remove this element form the array
        if (isArray(ptag.tags[tagName]))
          each(ptag.tags[tagName], function(tag, i) {
            if (tag._id == self._id)
              ptag.tags[tagName].splice(i, 1)
          })
        else
          // otherwise just delete the tag instance
          ptag.tags[tagName] = undefined
      }

      else
        while (el.firstChild) el.removeChild(el.firstChild)

      if (!keepRootTag)
        p.removeChild(el)
      else
        // the riot-tag attribute isn't needed anymore, remove it
        p.removeAttribute('riot-tag')
    }


    self.trigger('unmount')
    toggle()
    self.off('*')
    // somehow ie8 does not like `delete root._tag`
    root._tag = null

  }

  function toggle(isMount) {

    // mount/unmount children
    each(childTags, function(child) { child[isMount ? 'mount' : 'unmount']() })

    // listen/unlisten parent (events flow one way from parent to children)
    if (parent) {
      var evt = isMount ? 'on' : 'off'

      // the loop tags will be always in sync with the parent automatically
      if (isLoop)
        parent[evt]('unmount', self.unmount)
      else
        parent[evt]('update', self.update)[evt]('unmount', self.unmount)
    }
  }

  // named elements available for fn
  parseNamedElements(dom, this, childTags)


}

function setEventHandler(name, handler, dom, tag) {

  dom[name] = function(e) {

    var item = tag._item,
        ptag = tag.parent,
        el

    if (!item)
      while (ptag && !item) {
        item = ptag._item
        ptag = ptag.parent
      }

    // cross browser event fix
    e = e || window.event

    // ignore error on some browsers
    try {
      e.currentTarget = dom
      if (!e.target) e.target = e.srcElement
      if (!e.which) e.which = e.charCode || e.keyCode
    } catch (ignored) { /**/ }

    e.item = item

    // prevent default behaviour (by default)
    if (handler.call(tag, e) !== true && !/radio|check/.test(dom.type)) {
      if (e.preventDefault) e.preventDefault()
      e.returnValue = false
    }

    if (!e.preventUpdate) {
      el = item ? getImmediateCustomParentTag(ptag) : tag
      el.update()
    }

  }

}

// used by if- attribute
function insertTo(root, node, before) {
  if (root) {
    root.insertBefore(before, node)
    root.removeChild(node)
  }
}

function update(expressions, tag) {

  each(expressions, function(expr, i) {

    var dom = expr.dom,
        attrName = expr.attr,
        value = tmpl(expr.expr, tag),
        parent = expr.dom.parentNode

    if (expr.bool)
      value = value ? attrName : false
    else if (value == null)
      value = ''

    // leave out riot- prefixes from strings inside textarea
    // fix #815: any value -> string
    if (parent && parent.tagName == 'TEXTAREA') value = ('' + value).replace(/riot-/g, '')

    // no change
    if (expr.value === value) return
    expr.value = value

    // text node
    if (!attrName) {
      dom.nodeValue = '' + value    // #815 related
      return
    }

    // remove original attribute
    remAttr(dom, attrName)
    // event handler
    if (isFunction(value)) {
      setEventHandler(attrName, value, dom, tag)

    // if- conditional
    } else if (attrName == 'if') {
      var stub = expr.stub,
          add = function() { insertTo(stub.parentNode, stub, dom) },
          remove = function() { insertTo(dom.parentNode, dom, stub) }

      // add to DOM
      if (value) {
        if (stub) {
          add()
          dom.inStub = false
          // avoid to trigger the mount event if the tags is not visible yet
          // maybe we can optimize this avoiding to mount the tag at all
          if (!isInStub(dom)) {
            walk(dom, function(el) {
              if (el._tag && !el._tag.isMounted) el._tag.isMounted = !!el._tag.trigger('mount')
            })
          }
        }
      // remove from DOM
      } else {
        stub = expr.stub = stub || document.createTextNode('')
        // if the parentNode is defined we can easily replace the tag
        if (dom.parentNode)
          remove()
        else
        // otherwise we need to wait the updated event
          (tag.parent || tag).one('updated', remove)

        dom.inStub = true
      }
    // show / hide
    } else if (/^(show|hide)$/.test(attrName)) {
      if (attrName == 'hide') value = !value
      dom.style.display = value ? '' : 'none'

    // field value
    } else if (attrName == 'value') {
      dom.value = value

    // <img src="{ expr }">
    } else if (startsWith(attrName, RIOT_PREFIX) && attrName != RIOT_TAG) {
      if (value)
        dom.setAttribute(attrName.slice(RIOT_PREFIX.length), value)

    } else {
      if (expr.bool) {
        dom[attrName] = value
        if (!value) return
      }

      if (typeof value !== T_OBJECT) dom.setAttribute(attrName, value)

    }

  })

}
function each(els, fn) {
  for (var i = 0, len = (els || []).length, el; i < len; i++) {
    el = els[i]
    // return false -> remove current item during loop
    if (el != null && fn(el, i) === false) i--
  }
  return els
}

function isFunction(v) {
  return typeof v === T_FUNCTION || false   // avoid IE problems
}

function remAttr(dom, name) {
  dom.removeAttribute(name)
}

function getTag(dom) {
  return dom.tagName && tagImpl[dom.getAttribute(RIOT_TAG) || dom.tagName.toLowerCase()]
}

function initChildTag(child, dom, parent) {
  var tag = new Tag(child, { root: dom, parent: parent }, dom.innerHTML),
      tagName = getTagName(dom),
      ptag = getImmediateCustomParentTag(parent),
      cachedTag

  // fix for the parent attribute in the looped elements
  tag.parent = ptag

  cachedTag = ptag.tags[tagName]

  // if there are multiple children tags having the same name
  if (cachedTag) {
    // if the parent tags property is not yet an array
    // create it adding the first cached tag
    if (!isArray(cachedTag))
      ptag.tags[tagName] = [cachedTag]
    // add the new nested tag to the array
    if (!~ptag.tags[tagName].indexOf(tag))
      ptag.tags[tagName].push(tag)
  } else {
    ptag.tags[tagName] = tag
  }

  // empty the child node once we got its template
  // to avoid that its children get compiled multiple times
  dom.innerHTML = ''

  return tag
}

function getImmediateCustomParentTag(tag) {
  var ptag = tag
  while (!getTag(ptag.root)) {
    if (!ptag.parent) break
    ptag = ptag.parent
  }
  return ptag
}

function getTagName(dom) {
  var child = getTag(dom),
    namedTag = dom.getAttribute('name'),
    tagName = namedTag && namedTag.indexOf(brackets(0)) < 0 ? namedTag : child ? child.name : dom.tagName.toLowerCase()

  return tagName
}

function extend(src) {
  var obj, args = arguments
  for (var i = 1; i < args.length; ++i) {
    if ((obj = args[i])) {
      for (var key in obj) {      // eslint-disable-line guard-for-in
        src[key] = obj[key]
      }
    }
  }
  return src
}

// with this function we avoid that the current Tag methods get overridden
function cleanUpData(data) {
  if (!(data instanceof Tag) && !(data && typeof data.trigger == T_FUNCTION)) return data

  var o = {}
  for (var key in data) {
    if (!~RESERVED_WORDS_BLACKLIST.indexOf(key))
      o[key] = data[key]
  }
  return o
}

function walk(dom, fn) {
  if (dom) {
    if (fn(dom) === false) return
    else {
      dom = dom.firstChild

      while (dom) {
        walk(dom, fn)
        dom = dom.nextSibling
      }
    }
  }
}

// minimize risk: only zero or one _space_ between attr & value
function walkAttributes(html, fn) {
  var m,
      re = /([-\w]+) ?= ?(?:"([^"]*)|'([^']*)|({[^}]*}))/g

  while ((m = re.exec(html))) {
    fn(m[1].toLowerCase(), m[2] || m[3] || m[4])
  }
}

function isInStub(dom) {
  while (dom) {
    if (dom.inStub) return true
    dom = dom.parentNode
  }
  return false
}

function mkEl(name) {
  return document.createElement(name)
}

function replaceYield(tmpl, innerHTML) {
  return tmpl.replace(/<(yield)\/?>(<\/\1>)?/gi, innerHTML || '')
}

function $$(selector, ctx) {
  return (ctx || document).querySelectorAll(selector)
}

function $(selector, ctx) {
  return (ctx || document).querySelector(selector)
}

function inherit(parent) {
  function Child() {}
  Child.prototype = parent
  return new Child()
}

function setNamed(dom, parent, keys) {
  if (dom._visited) return
  var p,
      v = dom.getAttribute('id') || dom.getAttribute('name')

  if (v) {
    if (keys.indexOf(v) < 0) {
      p = parent[v]
      if (!p)
        parent[v] = dom
      else if (isArray(p))
        p.push(dom)
      else
        parent[v] = [p, dom]
    }
    dom._visited = true
  }
}

// faster String startsWith alternative
function startsWith(src, str) {
  return src.slice(0, str.length) === str
}

/*
 Virtual dom is an array of custom tags on the document.
 Updates and unmounts propagate downwards from parent to children.
*/

var virtualDom = [],
    tagImpl = {},
    styleNode

function injectStyle(css) {

  if (riot.render) return // skip injection on the server

  if (!styleNode) {
    styleNode = mkEl('style')
    styleNode.setAttribute('type', 'text/css')
  }

  var head = document.head || document.getElementsByTagName('head')[0]

  if (styleNode.styleSheet)
    styleNode.styleSheet.cssText += css
  else
    styleNode.innerHTML += css

  if (!styleNode._rendered)
    if (styleNode.styleSheet) {
      document.body.appendChild(styleNode)
    } else {
      var rs = $('style[type=riot]')
      if (rs) {
        rs.parentNode.insertBefore(styleNode, rs)
        rs.parentNode.removeChild(rs)
      } else head.appendChild(styleNode)

    }

  styleNode._rendered = true

}

function mountTo(root, tagName, opts) {
  var tag = tagImpl[tagName],
      // cache the inner HTML to fix #855
      innerHTML = root._innerHTML = root._innerHTML || root.innerHTML

  // clear the inner html
  root.innerHTML = ''

  if (tag && root) tag = new Tag(tag, { root: root, opts: opts }, innerHTML)

  if (tag && tag.mount) {
    tag.mount()
    virtualDom.push(tag)
    return tag.on('unmount', function() {
      virtualDom.splice(virtualDom.indexOf(tag), 1)
    })
  }

}

riot.tag = function(name, html, css, attrs, fn) {
  if (isFunction(attrs)) {
    fn = attrs
    if (/^[\w\-]+\s?=/.test(css)) {
      attrs = css
      css = ''
    } else attrs = ''
  }
  if (css) {
    if (isFunction(css)) fn = css
    else injectStyle(css)
  }
  tagImpl[name] = { name: name, tmpl: html, attrs: attrs, fn: fn }
  return name
}

riot.mount = function(selector, tagName, opts) {

  var els,
      allTags,
      tags = []

  // helper functions

  function addRiotTags(arr) {
    var list = ''
    each(arr, function (e) {
      list += ', *[' + RIOT_TAG + '="' + e.trim() + '"]'
    })
    return list
  }

  function selectAllTags() {
    var keys = Object.keys(tagImpl)
    return keys + addRiotTags(keys)
  }

  function pushTags(root) {
    var last
    if (root.tagName) {
      if (tagName && (!(last = root.getAttribute(RIOT_TAG)) || last != tagName))
        root.setAttribute(RIOT_TAG, tagName)

      var tag = mountTo(root,
        tagName || root.getAttribute(RIOT_TAG) || root.tagName.toLowerCase(), opts)

      if (tag) tags.push(tag)
    }
    else if (root.length) {
      each(root, pushTags)   // assume nodeList
    }
  }

  // ----- mount code -----

  if (typeof tagName === T_OBJECT) {
    opts = tagName
    tagName = 0
  }

  // crawl the DOM to find the tag
  if (typeof selector === T_STRING) {
    if (selector === '*')
      // select all the tags registered
      // and also the tags found with the riot-tag attribute set
      selector = allTags = selectAllTags()
    else
      // or just the ones named like the selector
      selector += addRiotTags(selector.split(','))

    els = $$(selector)
  }
  else
    // probably you have passed already a tag or a NodeList
    els = selector

  // select all the registered and mount them inside their root elements
  if (tagName === '*') {
    // get all custom tags
    tagName = allTags || selectAllTags()
    // if the root els it's just a single tag
    if (els.tagName)
      els = $$(tagName, els)
    else {
      // select all the children for all the different root elements
      var nodeList = []
      each(els, function (_el) {
        nodeList.push($$(tagName, _el))
      })
      els = nodeList
    }
    // get rid of the tagName
    tagName = 0
  }

  if (els.tagName)
    pushTags(els)
  else
    each(els, pushTags)

  return tags
}

// update everything
riot.update = function() {
  return each(virtualDom, function(tag) {
    tag.update()
  })
}

// @deprecated
riot.mountTo = riot.mount

  // share methods for other riot parts, e.g. compiler
  riot.util = { brackets: brackets, tmpl: tmpl }

  // support CommonJS, AMD & browser
  /* istanbul ignore next */
  if (typeof exports === T_OBJECT)
    module.exports = riot
  else if (typeof define === 'function' && define.amd)
    define(function() { return (window.riot = riot) })
  else
    window.riot = riot

})(typeof window != 'undefined' ? window : void 0);

(function(window, riot) {
    "use strict";

    var veronica = {
        version: "v0.9.0",
        settings: {
            viewTag: ".app-body",
            maxPageTransitionTime: 200,
            enablePageTransitions:false,
            listenPopState:true
        }
    };

    var gems={
        flux:{}
    };

    var semiQualifiedBrowsers = [
        "UCBrowser",
        "Opera Mini"
    ];

    var globals = {
        BROWSER_SUPPORT : "A" //A for full support, B for semi support
    };
/*============================
Author : Prateek Bhatnagar
Data : 7th-Sept-2015
Description : This facilitates the capability detection and suppliment for the framework
=============================*/

;
(function(gems) {
    function testAnimationCapability() {
        var animation = false,
            animationstring = "animation",
            keyframeprefix = "",
            domPrefixes = "Webkit Moz O ms Khtml".split(" "),
            pfx = "",
            elm = $("body")[0];

        if (elm.style.animationName !== undefined) {
            animation = true;
        }

        if (animation === false) {
            for (var i = 0; i < domPrefixes.length; i++) {
                if (elm.style[domPrefixes[i] + "AnimationName"] !== undefined) {
                    pfx = domPrefixes[i];
                    animationstring = pfx + "Animation";
                    keyframeprefix = "-" + pfx.toLowerCase() + "-";
                    animation = true;
                    break;
                }
            }
        }

        return animation;
    }

    function isBrowserSemiSupported() {
        for (var uaIndex = 0; uaIndex < semiQualifiedBrowsers; uaIndex++) {
            var currUA = semiQualifiedBrowsers[uaIndex];
            if (navigator.userAgent.indexOf(currUA) !== -1) {
                return true;
            }
        }
        return false;
    }

    function handleClick(e) {
        var node = e.target;
        var parentCount = 0;
        while (node && parentCount < 4) {
            if (node.tagName === "A") {
                e.preventDefault();
                var pageEnterEffect = "mounting";
                var pageLeaveEffect = "unmount";
                if (!!node.getAttribute("data-pageentereffect")) {
                    pageEnterEffect = node.getAttribute("data-pageentereffect").trim();
                }
                if (!!node.getAttribute("data-pageleaveeffect")) {
                    pageLeaveEffect = node.getAttribute("data-pageleaveeffect").trim();
                }
                veronica.loc(node.getAttribute("href"), pageEnterEffect, pageLeaveEffect);
                break;
            } else {
                node = node.parentNode;
                parentCount = parentCount + 1;
            }

        }
    }

    function createEvent(e) {
        var ev = document.createEvent("CustomEvent");
        ev.initEvent(e);
        return ev;
    };

    gems.capabilities = {
        testAnimationCapability: testAnimationCapability,
        isBrowserSemiSupported: isBrowserSemiSupported,
        handleClick: handleClick,
        createEvent:createEvent
    };
})(gems)

/*============================
Author : Prateek Bhatnagar
Data : 7th-Sept-2015
Description : This facilitates a mock sizzle selector
=============================*/
;(function(window) {
    window.$ = function(tag, root) {
        return document.querySelectorAll(tag, root);
    };
})(window);
(function(gems) {

    var PB = function() {
        var _self = this,
            _events = {};

        _self.on = function(event, fn, once) {
            if (arguments.length < 2 ||
                typeof event !== "string" ||
                typeof fn !== "function") return;

            var fnString = fn.toString();

            // if the named event object already exists in the dictionary...
            if (typeof _events[event] !== "undefined") {
                if (typeof once === "boolean") {
                    // the function already exists, so update it's 'once' value.
                    _events[event].callbacks[fnString].once = once;
                } else {
                    _events[event].callbacks[fnString] = {
                        cb: fn,
                        once: !!once
                    };
                }
            } else {
                // create a new event object in the dictionary with the specified name and callback.
                _events[event] = {
                    callbacks: {}
                };

                _events[event].callbacks[fnString] = {
                    cb: fn,
                    once: !!once
                };
            }
        };

        _self.once = function(event, fn) {
            _self.on(event, fn, true);
        };

        _self.off = function(event, fn) {
            if (typeof event !== "string" ||
                typeof _events[event] === "undefined") return;

            // remove just the function, if passed as a parameter and in the dictionary.
            if (typeof fn === "function") {
                var fnString = fn.toString(),
                    fnToRemove = _events[event].callbacks[fnString];

                if (typeof fnToRemove !== "undefined") {
                    // delete the callback object from the dictionary.
                    delete _events[event].callbacks[fnString];
                }
            } else {
                // delete all functions in the dictionary that are
                // registered to this event by deleting the named event object.
                delete _events[event];
            }
        };

        _self.trigger = function(event, data) {
            if (typeof event !== "string" ||
                typeof _events[event] === "undefined") return;

            for (var fnString in _events[event].callbacks) {
                var callbackObject = _events[event].callbacks[fnString];

                if (typeof callbackObject.cb === "function") callbackObject.cb(data);
                if (typeof callbackObject.once === "boolean" && callbackObject.once === true) _self.off(event, callbackObject.cb);
            }
        };

    };

    gems.PB=PB;
    gems.Dispatcher = new PB();

})(gems);

/* Promises ===============*/
(function(gems) {
    function Promise() {
        this._successCallbacks = [];
        this._errorCallbacks = [];
    }

    function resolvePromise(func, context, queue, promise) {
        queue.push(function() {
            var res = func.apply(context, arguments);
            if (res && typeof res.then === "function")
                res.then(promise.done, promise);
        });
    }

    Promise.prototype.then = function(func, context) {
        var p;
        if (this._isdone) {
            p = func.apply(context, this.result);
        } else {
            p = new Promise();
            resolvePromise(func, context, this._successCallbacks, p);
        }
        return this;
    };

    Promise.prototype.catch = function(func, context) {
        var p;
        if (this._isdone && this._isfailure) {
            p = func.apply(context, this.result);
        } else {
            p = new Promise();
            resolvePromise(func, context, this._errorCallbacks, p);
        }
        return this;
    };

    Promise.prototype.resolve = function() {
        this.result = arguments;
        this._isdone = true;
        this._issuccess = true;
        for (var i = 0; i < this._successCallbacks.length; i++) {
            this._successCallbacks[i].apply(null, arguments);
        }
        this._successCallbacks = [];
    };

    Promise.prototype.reject = function() {
        this.result = arguments;
        this._isdone = true;
        this._isfailure = true;
        for (var i = 0; i < this._errorCallbacks.length; i++) {
            this._errorCallbacks[i].apply(null, arguments);
        }
        this._errorCallbacks = [];
    };

    var promise = {
        Promise: Promise
    };

    gems.promise = promise;
})(gems);
/* Ajax ===============*/
;(function(gems) {
    var globalHeaders={};
    var globalData={};

    function _encode(data) {
        var result = "";
        if (typeof data === "string") {
            result = data;
        } else {
            var e = encodeURIComponent;
            for (var k in data) {
                if (data.hasOwnProperty(k)) {
                    result += "&" + e(k) + "=" + e(data[k]);
                }
            }
        }
        return result;
    }

    function new_xhr() {
        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        } else if (window.ActiveXObject) {
            try {
                xhr = new ActiveXObject("Msxml2.XMLHTTP");
            } catch (e) {
                xhr = new ActiveXObject("Microsoft.XMLHTTP");
            }
        }
        return xhr;
    }


    function ajax(method, url, data, headers) {
        var p = new gems.promise.Promise();
        var xhr, payload;
        data = data || {};
        headers = headers || {};

        for(var tempHeader in globalHeaders){
            headers[tempHeader]=globalHeaders[tempHeader];
        }

        for(var tempData in globalData){
            data[tempData]=globalData[tempData];
        }

        try {
            xhr = new_xhr();
        } catch (e) {
            p.reject(veronicaAjax.ENOXHR,"AJAX:ABSENT");
            return p;
        }

        payload = _encode(data);
        if (method === "GET" && payload) {
            url += "?" + payload;
            payload = null;
        }

        xhr.open(method, url);
        if (method === "POST") {
            xhr.setRequestHeader("Content-type", "application/json");
        } else {
            xhr.setRequestHeader("Content-type", "*/*");
        }
        for (var h in headers) {
            if (headers.hasOwnProperty(h)) {
                xhr.setRequestHeader(h, headers[h]);
            }
        }

        function onTimeout() {
            p.reject(veronicaAjax.ETIMEOUT, "AJAX:TIMEOUT", xhr);
            xhr.abort();
        }

        var timeout = veronicaAjax.ajaxTimeout;
        if (timeout) {
            var tid = setTimeout(onTimeout, timeout);
        }

        xhr.onreadystatechange = function() {
            if (timeout) {
                clearTimeout(tid);
            }
            if (xhr.readyState === 4) {
                var err = (!xhr.status ||
                    (xhr.status < 200 || xhr.status >= 300) &&
                    xhr.status !== 304);
                if (err) {
                    p.reject(xhr.responseText, xhr);
                } else {
                    p.resolve(xhr.responseText, xhr);
                }

            }
        };

        xhr.send(payload);
        return p;
    }

    function _ajaxer(method) {
        return function(url, data, headers) {
            return ajax(method, url, data, headers);
        };
    }

    function setGlobalHeaders(headers){
        globalHeaders=headers;
    }

    function getGlobalHeaders(){
        return globalHeaders;
    }

    function setGlobalData(data){
        globalData=data;
    }

    function getGlobalData(){
        return globalData;
    }

    function setAjaxTimeout(timeout){
        if(typeof timeout==="number"){
            veronicaAjax.ajaxTimeout=timeout;
        }
    }

    var veronicaAjax = {
        ajax: ajax,
        get: _ajaxer("GET"),
        post: _ajaxer("POST"),
        put: _ajaxer("PUT"),
        del: _ajaxer("DELETE"),
        /* Error codes */
        ENOXHR: 1,
        ETIMEOUT: 2,

        /**
         * Configuration parameter: time in milliseconds after which a
         * pending AJAX request is considered unresponsive and is
         * aborted. Useful to deal with bad connectivity (e.g. on a
         * mobile network). A 0 value disables AJAX timeouts.
         *
         * Aborted requests resolve the promise with a ETIMEOUT error
         * code.
         */
        ajaxTimeout: 15000
    };

    gems.http={};

    gems.http.ajax = veronicaAjax.ajax;
    gems.http.get = veronicaAjax.get;
    gems.http.post = veronicaAjax.post;
    gems.http.put = veronicaAjax.put;
    gems.http.delete = veronicaAjax.del;

    //global ajax funtions
    gems.httpGlobal={};
    gems.httpGlobal.setAjaxTimeout=setAjaxTimeout;
    gems.httpGlobal.getGlobalHeaders=getGlobalHeaders;
    gems.httpGlobal.setGlobalHeaders=setGlobalHeaders;
    gems.httpGlobal.getGlobalData=getGlobalData;
    gems.httpGlobal.setGlobalData=setGlobalData;

})(gems);
/* Persistance===============*/
(function(gems) {
    var componentDataStore = {};

    gems.Storage={};

    /* Session */
    var sessionData = [];

    function setSessionData(key, obj) {
        if (sessionStorage) {
            sessionStorage[key] = obj;
        } else {
            sessionData[key] = obj;
        }
    }

    function getSessionData(key) {
        return sessionStorage[key] || sessionData[key];
    }

    gems.Storage.Session = {
        set: setSessionData,
        get: getSessionData
    };


    /* DS */
    var DsData = [];

    function setDsData(key, obj) {
        if (localStorage) {
            localStorage[key] = obj;
        } else {
            DsData[key] = obj;
        }
    }

    function getDsData(key) {
        return localStorage[key] || DsData[key];
    }

    function removeData(key) {
        if (localStorage) {
            localStorage.removeItem(key);
        } else {
            delete DsData[key];
        }
    }

    gems.Storage.DS = {
        set: setDsData,
        get: getDsData,
        removeData: removeData
    };

})(gems);
/* Utils===============*/
/*============================
Author : Prateek Bhatnagar
Data : 6th-Sept-2015
Description : This is the lib for extending base store/action to user provided actions and stores
=============================*/
;
(function(gems) {
    var extend = function(base, child) {
        child.prototype = new base();
        return child;
    };

    gems.extender = extend;
})(gems);

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
                    var page=appStatus.viewTag.children&&appStatus.viewTag.children[0];
                    var tag=page&&page.children&&page.children[0];
                    if(tag._tag&&tag._tag.isMounted){
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

/*============================
Author : Prateek Bhatnagar
Data : 4th-Sept-2015
Description : This is the base class 
=============================*/
;(function(veronica, http, Dispatcher, promise) {
    var actions={};
    gems.flux.Actions={};

    function Action() {
        this.Dispatcher = {
            trigger: Dispatcher.trigger
        };
        this.Ajax = http;
        this.Promise = promise;
    }

    gems.flux.Actions.createAction=function(actionName,childClass){
        try{
            actions[actionName]=gems.extender(Action,childClass);    
            return true;
        }
        catch(e){
            return false;
        }
    }

    gems.flux.Actions.getAction=function(name){
        var klass=actions[name];
        if(klass){
            return new klass();    
        }
        else{
            return null;
        }
    }

})(veronica,gems.http, gems.Dispatcher, gems.promise);

/*============================
Author : Prateek Bhatnagar
Data : 6th-Sept-2015
Description : This is the base class for stores
=============================*/
;
(function(veronica, Dispatcher,PubSub) {
    var stores = {};
    gems.flux.Stores = {};

    function Store() {
        var PB=new PubSub();
        this.Dispatcher = {
            register: Dispatcher.on,
            unregister: Dispatcher.off,
            once: Dispatcher.once
        };
        this.Storage = gems.Storage;
        this.subscribe=PB.on;
        this.unsubscribe=PB.off;
        this.emit=function(eventName){PB.trigger(eventName,{});}
    }

    gems.flux.Stores.createStore = function(storeName,childClass) {
        try {
            var klass = gems.extender(Store, childClass);
            stores[storeName] = new klass();
            return true;
        } catch (e) {
            return false;
        }
    }

    gems.flux.Stores.getStore = function(name) {
        return stores[name];
    }

})(veronica, gems.Dispatcher,gems.PB);

/*============================
Author : Prateek Bhatnagar
Data : 7th-Sept-2015
Description : This facilitates the initialization of the framework
=============================*/
(function(gems,veronica){
    function init() {

        if (!gems.capabilities.testAnimationCapability()) {
            $("body")[0].classList.add("noanim");
        }

        if (gems.capabilities.isBrowserSemiSupported()) {
            globals.BROWSER_SUPPORT = "B";
            $("body")[0].classList.add("noanim");
        }

        //mount riot
        riot.mount("*", {});

        //mount initial page
        if(gems.totalRouteLength()>0){
            veronica.loc(location.pathname);
            gems.Dispatcher.trigger("veronica:init");
        }

        document.addEventListener("click", gems.capabilities.handleClick);
    }

    document.onreadystatechange = function() {
        if (document.readyState == "interactive") {
            init();
        }
    };
})(gems,veronica);
    veronica.flux = gems.flux;
    veronica.http=gems.httpGlobal;
    window.veronica = veronica;

})(window, riot);