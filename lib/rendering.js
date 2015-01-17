'use strict';

var vec3 = require('gl-matrix').vec3

module.exports = function(game, opts) {
  return new Rendering(game, opts)
}


var _game
, _camera
, _mesher
, _stitcher
, _antialias
, _meshType
, _materialNames

function Rendering(game, opts) {
  _game = game 

  // the following appear to be unused, may be used in future
  _antialias = opts.antialias
  _meshType = opts.meshType || 'surfaceMesh'
  _materialNames = opts.materials
  
}


// TODO: abstract/remove these if possible?

// exposed APIs:

Rendering.prototype.setCameraPlugin = function(plugin) {
  _camera = plugin
}

Rendering.prototype.setMesherPlugin = function(plugin) {
  _mesher = plugin
}

Rendering.prototype.setStitcherPlugin = function(plugin, opts) {
  _stitcher = plugin
  
  var async = 'asyncChunkGeneration' in opts ? opts.asyncChunkGeneration : true
  _stitcher.on('updatedSides', function() {
    if (_game.generateChunks) _game.handleChunkGeneration()
    _game.showAllChunks()
    
    // TODO: fix async chunk gen, loadPendingChunks() may load 1 even if this.pendingChunks empty
    // TODO also: why is this here?
    setTimeout(function() {
      _game.asyncChunkGeneration = !!async
    }, 2000)
  })

}


Rendering.prototype.stitchVoxelMesh = function( gl, voxelArray, chunkPosition, chunkPad) {
  return _mesher.createVoxelMesh( 
    gl, voxelArray, _stitcher.voxelSideTextureIDs, 
    _stitcher.voxelSideTextureSizes, chunkPosition, chunkPad
  )
}



var _camPos = new Array(3)
Rendering.prototype.cameraPosition = function() {
  if (_camera) {
    _camera.getPosition(_camPos)
  }
  return _camPos
}

var _camVec3 = new Array(3)
Rendering.prototype.cameraVector = function() {
  if (_camera) {
    _camera.getVector(_camVec3)
  }
  return _camVec3
}





