'use strict';


module.exports = function(game, opts) {
  return new Inputs(game, opts)
}


var _game
, _buttons

, defaultButtons = {
  'W': 'forward'
  , 'A': 'left'
  , 'S': 'backward'
  , 'D': 'right'
  , '<up>': 'forward'
  , '<left>': 'left'
  , '<down>': 'backward'
  , '<right>': 'right'
  , '<mouse 1>': 'fire'
  , '<mouse 3>': 'firealt'
  , '<space>': 'jump'
  , '<shift>': 'crouch'
  , '<control>': 'alt'
  , '<tab>': 'sprint'
}


function Inputs(game, opts) {
  _game = game


  var keybindings = opts.keybindings || defaultButtons
  for (var key in keybindings) {
    var name = keybindings[key]

    // translate name for game-shell
    key = filtered_vkey(key)

    // TODO: rethink this dependency on game shell when I abstract Container
    _game.shell.bind(name, key)
  }

  // proxy buttons - sets this.buttons TODO: refresh when shell.bindings changes (bind/unbind)

  // Create the buttons state object (binding => state), proxying to game-shell .wasDown(binding)
  _buttons = {}

  Object.keys(_game.shell.bindings).forEach(function(name) {
    Object.defineProperty(
      _buttons, name, {get: function() {
        return _game.shell.pointerLock && _game.shell.wasDown(name)
      }}
    )  })


}

// temporary accessors for Game object

Inputs.prototype.tempOnFire = function(state) {
  _game.emit('fire', _game.controlling, state)
}
Inputs.prototype.tempGetButtons = function() {
  return _buttons
}



// cleanup key name - based on https://github.com/mikolalysenko/game-shell/blob/master/shell.js
function filtered_vkey (k) {
  if(k.charAt(0) === '<' && k.charAt(k.length-1) === '>') {
    k = k.substring(1, k.length-1)
  }
  k = k.replace(/\s/g, "-")
  return k
}


