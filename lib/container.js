'use strict';

var Stats = require('./stats')
var Detector = require('./detector')
var createShell = require('gl-now')

module.exports = function(game, opts) {
  return new Container(game, opts)
}


var _game
, _container
, _shell
, _stats
, foundNotCapable = false




function Container(game, opts) {
  _game = game

  _container = createContainerDiv(opts)
  _game.createContainer = _container

  // temporary:
  _game.width = _container.clientWidth
  //  _game.height = container.clientHeight
  Object.defineProperty(_game, 'height', {get:function() { throw new Error('Game.height read..') }})
}


// TODO: abstract/remove these if possible?
Container.prototype.getContainer = function() {
  return _container
}
Container.prototype.getShell = function() {
  return _shell
}



// exposed APIs:


Container.prototype.appendTo = function(el) {
  _container.appendChild( el )
}


Container.prototype.createShell = function( opts ) {
  var shellOpts = opts.shellOpts || {}
  var sky = opts.skyColor
  shellOpts.clearColor = [
    (sky >> 16) / 255.0,
    ((sky >> 8) & 0xff) / 255.0,
    (sky & 0xff) / 255.0,
    1.0
  ]
  shellOpts.pointerLock = opts.pointerLock !== undefined ? opts.pointerLock : true
  _shell = createShell(shellOpts)
  
  // should not be reached; notCapable() checked for WebGL compatibility first
  _shell.on('gl-error', function(err) {
    document.body.appendChild(document.createTextNode('Fatal WebGL error: ' + err))
  })

}


Container.prototype.notCapable = function(opts) {
  if (foundNotCapable) return true // write error message only once
  if( !Detector().webgl ) {
    foundNotCapable = true
    this.appendTo( createNotCapableMessage() )
    return true
  }
  return false
}

function createNotCapableMessage() {
  var wrapper = document.createElement('div')
  wrapper.className = "errorMessage"
  var a = document.createElement('a')
  a.title = "You need WebGL and Pointer Lock (Chrome 23/Firefox 14) to play this game. Click here for more information."
  a.innerHTML = a.title
  a.href = "http://get.webgl.org"
  wrapper.appendChild(a)
  return wrapper
}




Container.prototype.addStats = function() {
  // not useful until somebody hooks up the result to a tick function..
  var stats = new Stats()
  stats.domElement.style.position  = 'absolute'
  stats.domElement.style.bottom  = '0px'
  this.appendTo( stats.domElement )
  return stats
}



function createContainerDiv(opts) {
  if (opts.container) return opts.container

  // based on game-shell makeDefaultContainer()
  var container = document.createElement("div")
  container.tabindex = 1
  container.style.position = "absolute"
  container.style.left = "0px"
  container.style.right = "0px"
  container.style.top = "0px"
  container.style.bottom = "0px"
  container.style.height = "100%"
  container.style.overflow = "hidden"
  document.body.appendChild(container)
  document.body.style.overflow = "hidden" //Prevent bounce
  document.body.style.height = "100%"
  return container
}


// this function not edited yet...
Container.prototype.setDimensions = function(opts) {
  if (opts.container) this.container = opts.container
  if (opts.container && opts.container.clientHeight) {
    this.height = opts.container.clientHeight
  } else {
    this.height = typeof window === "undefined" ? 1 : window.innerHeight
  }
  if (opts.container && opts.container.clientWidth) {
    this.width = opts.container.clientWidth
  } else {
    this.width = typeof window === "undefined" ? 1 : window.innerWidth
  }
}






