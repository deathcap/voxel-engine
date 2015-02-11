'use strict';

var vec3 = require('gl-vec3')

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
  this.camera = null
  
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
Rendering.prototype.setCamera = function(cam) {
  this.camera = cam
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
  // Negate since basic-camera considers -Y up (etc.), but we use +Y for up
  _camPos[0] = -this.camera.position[0]
  _camPos[1] = -this.camera.position[1]
  _camPos[2] = -this.camera.position[2]
  return _camPos
}

var _camVec3 = new Array(3)
Rendering.prototype.cameraVector = function() {
  this.camera.getCameraVector(_camVec3)
  _camVec3[0] = -_camVec3[0]
  _camVec3[1] = -_camVec3[1]
  _camVec3[2] = -_camVec3[2]
  return _camVec3
}





