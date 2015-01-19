'use strict';

var physical = require('voxel-physicals')
var collisions = require('collide-3d-tilemap')



module.exports = function(game, opts) {
  return new Physics(game, opts)
}

var _game
, _gravity
, _friction
, _epilson
, _terminalVelocity
, _collideVoxels


function Physics(game, opts) {
  _game = game

  _gravity = [0, -0.0000036, 0]
  _friction = 0.3
  _epilson = 1e-8
  _terminalVelocity = [0.9, 0.1, 0.9]

  
  //  _game.potentialCollisionSet = function() { return potentialCollisionSet() }

  _collideVoxels = collisions(
    _game.getBlock.bind(_game),
    1,
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity]
  )
}


// API SURFACE


Physics.prototype.getGravity = function() { // TODO: remove
  return _gravity
}

Physics.prototype.makePhysical = function(target, envelope, blocksCreation) {
  var vel = _terminalVelocity
  envelope = envelope || [2/3, 1.5, 2/3]
  var obj = physical(target, 
                     getPotentialCollisionSet(), 
                     envelope, 
                     {x: vel[0], y: vel[1], z: vel[2]}
                    )
  obj.blocksCreation = !!blocksCreation
  return obj
}





// internals


function getPotentialCollisionSet() {
  return [{ collide: collideTerrain }]
}


function collideTerrain(other, bbox, vec, resting) {
  _collideVoxels(bbox, vec, function hit(axis, tile, coords, dir, edge) {
    if (!tile) return
    if (Math.abs(vec[axis]) < Math.abs(edge)) return
    vec[axis] = edge
    other.acceleration[axis] = 0
    resting[['x','y','z'][axis]] = dir // TODO: change to glm vec3 array?
    other.friction[(axis + 1) % 3] = other.friction[(axis + 2) % 3] = axis === 1 ? _friction  : 1
    return true
  })
}



