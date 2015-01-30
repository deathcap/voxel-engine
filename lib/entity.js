'use strict';

var vec3 = require('gl-matrix').vec3

module.exports = function(data, body, offset, mesh, tickFn) {
  return new Entity(data, body, offset, mesh, tickFn)
}


/*
 *  data:     data object for use by consumer
 *  body:     rigid body (from physics engine), with an aabb
 *  offset:   vec3 of offset from entity's AABB to its 'center'
 *  mesh:     TBD
 *  tickFn:   tick function (called by Game if present)
*/

function Entity(data, body, offset, mesh, tickFn) {
  this.data = data || {}
  this.body = body || undefined
  this.offset = offset || undefined
  this.mesh = mesh || undefined
  this.tick = tickFn || undefined
}

Entity.prototype.getPosition = function() {
  var p = vec3.create()
  vec3.copy( p, this.body.aabb.base )
  if (this.offset) vec3.add( p, p, this.offset )
  return p
}





