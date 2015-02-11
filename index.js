'use strict'
var voxel = require('voxel')
var ray = require('voxel-raycast')
var createController = require('voxel-fps-controller')
var inherits = require('inherits')
var path = require('path')
var EventEmitter = require('events').EventEmitter
var aabb = require('aabb-3d')
var vec3 = require('gl-vec3')
var SpatialEventEmitter = require('spatial-events')
var regionChange = require('voxel-region-change')
var tic = require('tic')()
var ndarray = require('ndarray')
var isndarray = require('isndarray')

var createPlugins = require('voxel-plugins')
var extend = require('extend')
require('voxel-registry')
require('voxel-stitch')
require('voxel-shader')
require('voxel-mesher')
var createBasicCamera = require('basic-camera')
var createPhysEngine = require('voxel-physics-engine')

var createInputs = require('./lib/inputs')
var createContainer = require('./lib/container')
var createRendering = require('./lib/rendering')
var createEntity = require('./lib/entity')

module.exports = Game

var BUILTIN_PLUGIN_OPTS = {
  'voxel-registry': {},
  'voxel-stitch': {},
  'voxel-shader': {},
  'voxel-mesher': {},
}

function Game(opts) {
  if (!(this instanceof Game)) return new Game(opts)
  var self = this
  if (!opts) opts = {}
  if (opts.pluginOpts && opts.pluginOpts['voxel-engine']) opts = extend(opts, opts.pluginOpts['voxel-engine'])

  // create container submodule
  this.container = createContainer( this, opts )
  if (process.browser && this.container.notCapable(opts)) return


  // is this a client or a headless server
  this.isClient = Boolean( (typeof opts.isClient !== 'undefined') ? opts.isClient : process.browser )

  if (!('generateChunks' in opts)) opts.generateChunks = true
  this.generateChunks = opts.generateChunks
  this.setConfigurablePositions(opts)
  this.configureChunkLoading(opts)
  Object.defineProperty(this, 'THREE', {get:function() { throw new Error('voxel-engine "THREE property removed') }})
  Object.defineProperty(this, 'vector', {get:function() { throw new Error('voxel-engine "vector" property removed') }})
  Object.defineProperty(this, 'glMatrix', {get:function() { throw new Error('voxel-engine "glMatrix" property removed') }})
  this.vec3 = vec3
  this.arrayType = opts.arrayType || {1:Uint8Array, 2:Uint16Array, 4:Uint32Array}[opts.arrayTypeSize] || Uint8Array
  this.cubeSize = 1 // backwards compat
  this.chunkSize = opts.chunkSize || 32
  this.chunkPad = opts.chunkPad || 4

  // chunkDistance and removeDistance should not be set to the same thing
  // as it causes lag when you go back and forth on a chunk boundary
  this.chunkDistance = opts.chunkDistance || 2
  this.removeDistance = opts.removeDistance || this.chunkDistance + 1



  // set up rendering
  this.rendering = createRendering(this, opts)

  // warn about many removed or NYI rendering properties:
  Object.defineProperty(this, 'mesher', {get:function() { throw new Error('voxel-engine "mesher" property removed') }})
  Object.defineProperty(this, 'scene', {get:function() { throw new Error('voxel-engine "scene" property removed') }})
  Object.defineProperty(this, 'view', {get:function() { throw new Error('voxel-engine "view" property removed') }})
  Object.defineProperty(this, 'camera', {get:function() { throw new Error('voxel-engine "camera" property removed') }})
  Object.defineProperty(this, 'render', {get:function() { throw new Error('voxel-engine "render" method removed') }})
  Object.defineProperty(this, 'addMarker', {get:function() { throw new Error('voxel-engine "addMarker" is NYI') }})
  Object.defineProperty(this, 'addAABBMarker', {get:function() { throw new Error('voxel-engine "addAABBMarker" is NYI') }})
  Object.defineProperty(this, 'addVoxelMarker', {get:function() { throw new Error('voxel-engine "addVoxelMarker" is NYI') }})
  Object.defineProperty(this, 'skyColor', {get:function() { throw new Error('voxel-engine "skyColor" has moved into rendering module') }})
  Object.defineProperty(this, 'antialias', {get:function() { throw new Error('voxel-engine "antialias" has moved into rendering module') }})
  Object.defineProperty(this, 'meshType', {get:function() { throw new Error('voxel-engine "meshType" has moved into rendering module') }})

  // redirects for game properties (TODO: remove/abstract these)
  this.cameraPosition = this.rendering.cameraPosition.bind(this.rendering)
  this.cameraVector = this.rendering.cameraVector.bind(this.rendering)
  this.rendering.setCamera( createBasicCamera() )
  this.getCamera = function() { return this.rendering.camera }


  this.playerHeight = opts.playerHeight || 1.62


  // set up entities
  this.entities = []

  // voxel data
  this.voxels = voxel(this)


  // container/shell setup
  this.container.createShell( opts )

  // reference to shell, hopefully can someday abstract this?
  this.shell = this.container.getShell()

  //  container-related removal warnings:
  Object.defineProperty(this, 'setDimensions', {get:function() { throw new Error('voxel-engine "setDimensions" removed') }})
  Object.defineProperty(this, 'createContainer', {get:function() { throw new Error('voxel-engine "createContainer" moved to container module') }})
  Object.defineProperty(this, 'appendTo', {get:function() { throw new Error('voxel-engine "appendTo" moved to container module') }})
  Object.defineProperty(this, 'notCapable', {get:function() { throw new Error('voxel-engine "notCapable" moved to container module') }})
  Object.defineProperty(this, 'notCapableMessage', {get:function() { throw new Error('voxel-engine "notCapableMessage" moved to container module') }})
  Object.defineProperty(this, 'height', {get:function() { throw new Error('voxel-engine "height" removed') }})
  Object.defineProperty(this, 'width', {get:function() { throw new Error('voxel-engine "width" removed') }})


  // setup plugins
  var plugins = createPlugins(this, {require: function(name) {
    // we provide the built-in plugins ourselves; otherwise check caller's require, if any
    // TODO: allow caller to override built-ins? better way to do this?
    if (name in BUILTIN_PLUGIN_OPTS) {
      return require(name)
    } else {
      return opts.require ? opts.require(name) : require(name)
    }
  }})


  this.timer = this.initializeTimer((opts.tickFPS || 16))
  this.paused = false

  this.spatial = new SpatialEventEmitter()
  this.region = regionChange(this.spatial, aabb([0, 0, 0], [1, 1, 1]), this.chunkSize)
  this.voxelRegion = regionChange(this.spatial, 1)
  this.chunkRegion = regionChange(this.spatial, this.chunkSize)
  this.asyncChunkGeneration = false

  // contains chunks that has had an update this tick. Will be generated right before redrawing the frame
  this.chunksNeedsUpdate = {}
  // contains new chunks yet to be generated. Handled by game.loadPendingChunks
  this.pendingChunks = []

  if (this.isClient) {
    if (opts.exposeGlobal) window.game = window.g = this
      }


  self.chunkRegion.on('change', function(newChunk) {
    self.removeFarChunks()
  })

  // client side only after this point
  if (!this.isClient) return

  // materials
  if ('materials' in opts) throw new Error('opts.materials replaced with voxel-registry registerBlock()') // TODO: bridge?
 
  // physics setup
  var blockGetter = this.getBlock.bind(this)
  this.physics = createPhysEngine(opts, blockGetter)



  this.playerEntity = initPlayerEntity( this )

  // accessors for player - TODO: reconsider?
  this.playerPosition = function() {
    return this.playerEntity.getPosition()
  }


  // input related setup 

  this.inputs = createInputs(this,opts)
  //  (hopefully temporary) redirects to input funcitons
  this.onFire = function(state) { this.inputs.tempOnFire(state) }
  this.buttons = this.inputs.tempGetButtons()
  // Input-related removal warnings:
  Object.defineProperty(this, 'keybindings', {get:function() { throw new Error('voxel-engine "keybindings" property removed') }})



  // hookup physics controls
  this.controller = createController(opts, this.buttons)
  this.controller.setTarget(this.playerEntity.body)
  var c = this.rendering.camera
  var camAccessor = {
    getRotationXY: function() { return [ c.rotationX, c.rotationY ] },
    setRotationXY: function(x,y) { c.rotationX = x; c.rotationY = y }
  }
  this.controller.setCameraAccessor(camAccessor)



  // setup plugins
  var pluginOpts = opts.pluginOpts || {}

  for (var name in BUILTIN_PLUGIN_OPTS) {
    pluginOpts[name] = pluginOpts[name] || BUILTIN_PLUGIN_OPTS[name]
  }

  for (var name2 in pluginOpts) {
    plugins.add(name2, pluginOpts[name2])
  }
  plugins.loadAll()


  // textures loaded, now can render chunks


  this.rendering.setStitcherPlugin( plugins.get('voxel-stitch'), opts )
  this.rendering.setMesherPlugin( plugins.get('voxel-mesher') )
  // TODO: support other plugins implementing same API

  // rendering-related removal warnings..
  Object.defineProperty(this, 'mesherPlugin', {get:function() { throw new Error('voxel-engine "mesherPlugin" property removed') }})
  Object.defineProperty(this, 'stitcher', {get:function() { throw new Error('voxel-engine "stitcher" property removed') }})

}

inherits(Game, EventEmitter)

// # External API

Game.prototype.voxelPosition = function(gamePosition) {
  var _ = Math.floor
  var p = gamePosition
  var v = []
  v[0] = _(p[0])
  v[1] = _(p[1])
  v[2] = _(p[2])
  return v
}




/*
 *    ENTITY MANAGEMENT
*/


Game.prototype.addEntity = function(data, aabb, offset, mesh, tickFn) {
  var body
  if (aabb) {
    body = this.physics.addBody( data, aabb )
  }
  var e = createEntity(data, body, offset, mesh, tickFn)
  this.entities.push(e)
  return e
}

Game.prototype.removeEntity = function(e) {
  var ix = this.entities.indexOf(e)
  if (ix < 0) return
  if (e.body) this.physics.removeBody(e.body)
  this.entities.splice(ix, 1)
}



// player entity creation

function initPlayerEntity(game) {
  // options ad-hoc for now..
  var playerW = 0.7
  var playerH = 1.6
  var paabb = new aabb( [ 0, 20, 0], [ playerW, playerH, playerW ] )
  var offset = vec3.fromValues( playerW/2, 0, playerW/2 )

  // create an avatar with references to the camera..
  var data = {
    cam: game.rendering.camera,
    camOffset: vec3.fromValues( playerW/2, playerH, playerW/2 )
  }

  // tick function references game's camera object and updates it
  var tick = function(dt) {
    var camPos = vec3.create()
    vec3.add( camPos, this.body.aabb.base, this.data.camOffset )
    // basic-camera uses inverse coords for some reason
    vec3.scale( camPos, camPos, -1 )
    this.data.cam.position = camPos
  }

  return game.addEntity( data, paabb, offset, null, tick )


  //  var body = this.physics.addBody( avatar, paabb, true )
  //  
  //  // entity (item) to house player values, tick function
  //  var p = {
  //    body: body,
  //    cam: this.rendering.camera,
  //    posOffset: vec3.fromValues( playerW/2, 0, playerW/2 ),
  //    camOffset: vec3.fromValues( playerW/2, playerH, playerW/2 )
  //  }
  //  p.getPosition = function() {
  //    var pos = vec3.create()
  //    return vec3.add( pos, this.body.aabb.base, this.posOffset )
  //  }
  //  p.getCamPosition = function() {
  //    var pos = vec3.create()
  //    return vec3.add( pos, this.body.aabb.base, this.camOffset )
  //  }
  //  p.tick = function(dt) {
  //    var cpos = this.getCamPosition()
  //    vec3.scale( cpos, cpos, -1 ) // camera uses inverse coords for some reason
  //    this.cam.position = cpos
  //  }
  //  this.addItem(p)
}









// only intersects voxels, not items (for now)
Game.prototype.raycast = // backwards compat
  Game.prototype.raycastVoxels = function(start, direction, maxDistance, epilson) {
  if (!start) return this.raycastVoxels(this.rendering.cameraPosition(), 
                                        this.rendering.cameraVector(), 10)

  var hitNormal = [0, 0, 0]
  var hitPosition = [0, 0, 0]
  var cp = start || this.rendering.cameraPosition()
  var cv = direction || this.rendering.cameraVector()
  var hitBlock = ray(this, cp, cv, maxDistance || 10.0, hitPosition, hitNormal, epilson || this.epilson)
  if (hitBlock <= 0) return false
  var adjacentPosition = [0, 0, 0]
  var voxelPosition = this.voxelPosition(hitPosition)
  vec3.add(adjacentPosition, voxelPosition, hitNormal)

  return {
    position: hitPosition,
    voxel: voxelPosition,
    direction: direction,
    value: hitBlock,
    normal: hitNormal,
    adjacent: adjacentPosition
  }
}

Game.prototype.canCreateBlock = function(pos) {
  pos = this.parseVectorArguments(arguments)
  var floored = pos.map(function(i) { return Math.floor(i) })
  var bbox = aabb(floored, [1, 1, 1])

  //  for (var i = 0, len = this.items.length; i < len; ++i) {
  //    var item = this.items[i]
  //    var itemInTheWay = item.blocksCreation && item.aabb && bbox.intersects(item.aabb())
  //    if (itemInTheWay) return false
  //  }

  return true
}

Game.prototype.createBlock = function(pos, val) {
  if (typeof val === 'string') val = this.materials.find(val)
  if (!this.canCreateBlock(pos)) return false
  this.setBlock(pos, val)
  return true
}

Game.prototype.setBlock = function(pos, val) {
  if (typeof val === 'string') val = this.materials.find(val)
  var old = this.voxels.voxelAtPosition(pos, val)
  var c = this.voxels.chunkAtPosition(pos)
  var chunk = this.voxels.chunks[c.join('|')]
  if (!chunk) return// todo - does self.emit('missingChunk', c.join('|')) make sense here?
  this.addChunkToNextUpdate(chunk)
  this.spatial.emit('change-block', pos, old, val)
  this.emit('setBlock', pos, val, old)
}

Game.prototype.getBlock = function(pos) {
  pos = this.parseVectorArguments(arguments)
  return this.voxels.voxelAtPosition(pos)
}

Game.prototype.blockPosition = function(pos) {
  pos = this.parseVectorArguments(arguments)
  var ox = Math.floor(pos[0])
  var oy = Math.floor(pos[1])
  var oz = Math.floor(pos[2])
  return [ox, oy, oz]
}

Game.prototype.blocks = function(low, high, iterator) {
  var l = low, h = high
  var d = [ h[0]-l[0], h[1]-l[1], h[2]-l[2] ]
  var voxels
  if (!iterator) voxels = new this.arrayType(d[0]*d[1]*d[2])
  var i = 0
  for(var z=l[2]; z<h[2]; ++z)
    for(var y=l[1]; y<h[1]; ++y)
      for(var x=l[0]; x<h[0]; ++x, ++i) {
        if (iterator) iterator(x, y, z, i)
        else voxels[i] = this.voxels.voxelAtPosition([x, y, z])
          }
  if (!iterator) return {voxels: voxels, dims: d}
    }

// backwards compat
Game.prototype.createAdjacent = function(hit, val) {
  this.createBlock(hit.adjacent, val)
}

// # Defaults/options parsing


// used in methods that have identity function(pos) {}
Game.prototype.parseVectorArguments = function(args) {
  if (!args) return false
  if (args[0] instanceof Array) return args[0]
  return [args[0], args[1], args[2]]
}

Game.prototype.setConfigurablePositions = function(opts) {
  var sp = opts.startingPosition
  this.startingPosition = sp || [35, 1024, 35]
  var wo = opts.worldOrigin
  this.worldOrigin = wo || [0, 0, 0]
}



/**
 * Get the position of the player under control.
 * If there is no player under control, return
 * current position of the game's camera.
 *
 * @return {Array} an [x, y, z] tuple
 */

Game.prototype.playerPosition = function() {
  return this.getPlayerPosition()
  //  var target = this.controls.target()
  //  if (!target) return this.rendering.cameraPosition()
  //  var position = target.avatar.position
  //  return [position.x, position.y, position.z]
}

//Game.prototype.playerAABB = function(position) {
//  var pos = position || this.playerPosition()
//  var lower = []
//  var upper = [1/2, this.playerHeight, 1/2]
//  var playerBottom = [1/4, this.playerHeight, 1/4]
//  vec3.subtract(lower, pos, playerBottom)
//  var bbox = aabb(lower, upper)
//  return bbox
//}



// # Chunk related methods

Game.prototype.configureChunkLoading = function(opts) {
  var self = this
  if (!opts.generateChunks) return
  if (!opts.generate) {
    this.generate = voxel.generator.Sphere
  } else if (typeof opts.generate === 'string') {
    this.generate = voxel.generator[opts.generate]
  } else {
    this.generate = opts.generate
  }
  if (opts.generateVoxelChunk) {
    this.generateVoxelChunk = opts.generateVoxelChunk
  } else {
    this.generateVoxelChunk = function(low, high) {
      return voxel.generate(low, high, self.generate, self)
    }
  }
}

Game.prototype.worldWidth = function() {
  return this.chunkSize * 2 * this.chunkDistance
}

Game.prototype.chunkToWorld = function(pos) {
  return [
    pos[0] * this.chunkSize,
    pos[1] * this.chunkSize,
    pos[2] * this.chunkSize
  ]
}

Game.prototype.removeFarChunks = function(playerPosition) {
  var self = this
  playerPosition = playerPosition || this.playerPosition()
  var nearbyChunks = this.voxels.nearbyChunks(playerPosition, this.removeDistance).map(function(chunkPos) {
    return chunkPos.join('|')
  })
  Object.keys(self.voxels.chunks).map(function(chunkIndex) {
    if (nearbyChunks.indexOf(chunkIndex) > -1) return
    var chunk = self.voxels.chunks[chunkIndex]
    var mesh = self.voxels.meshes[chunkIndex]
    var pendingIndex = self.pendingChunks.indexOf(chunkIndex)
    if (pendingIndex !== -1) self.pendingChunks.splice(pendingIndex, 1)
    if (!chunk) return
    var chunkPosition = chunk.position
    if (mesh) {
      // dispose of the gl-vao meshes
      for (var key in mesh.vertexArrayObjects) {
        mesh.vertexArrayObjects[key].dispose()
      }
    }
    delete self.voxels.chunks[chunkIndex]
    delete self.voxels.meshes[chunkIndex]
    self.emit('removeChunk', chunkPosition)
  })
  self.voxels.requestMissingChunks(playerPosition)
}

Game.prototype.addChunkToNextUpdate = function(chunk) {
  this.chunksNeedsUpdate[chunk.position.join('|')] = chunk
}

Game.prototype.updateDirtyChunks = function() {
  var self = this
  Object.keys(this.chunksNeedsUpdate).forEach(function showChunkAtIndex(chunkIndex) {
    var chunk = self.chunksNeedsUpdate[chunkIndex]
    self.emit('dirtyChunkUpdate', chunk)
    self.showChunk(chunk)
  })
  this.chunksNeedsUpdate = {}
}

Game.prototype.loadPendingChunks = function(count) {
  var pendingChunks = this.pendingChunks

  if (!this.asyncChunkGeneration) {
    count = pendingChunks.length
  } else {
    count = count || (pendingChunks.length * 0.1)
    count = Math.max(1, Math.min(count, pendingChunks.length))
  }

  for (var i = 0; i < count; i += 1) {
    var chunkPos = pendingChunks[i].split('|')
    var chunk = this.voxels.generateChunk(chunkPos[0]|0, chunkPos[1]|0, chunkPos[2]|0)

    if (this.isClient) this.showChunk(chunk)
      }

  if (count) pendingChunks.splice(0, count)
    }

Game.prototype.getChunkAtPosition = function(pos) {
  var chunkID = this.voxels.chunkAtPosition(pos).join('|')
  var chunk = this.voxels.chunks[chunkID]
  return chunk
}

Game.prototype.showAllChunks = function() {
  for (var chunkIndex in this.voxels.chunks) {
    this.showChunk(this.voxels.chunks[chunkIndex])
  }
}

// Calculate fraction of each voxel type in chunk, for debugging
var chunkDensity = function(chunk) {
  var counts = {}
  var length = chunk.data.length
  for (var i = 0; i < length; i += 1) {
    var val = chunk.data[i]
    if (!(val in counts)) counts[val] = 0

    counts[val] += 1
  }

  var densities = {}
  for (var val2 in counts) {
    densities[val2] = counts[val2] / length
  }
  return densities
}

Game.prototype.showChunk = function(chunk, optionalPosition) {
  if (optionalPosition) chunk.position = optionalPosition

  var chunkIndex = chunk.position.join('|')
  var bounds = this.voxels.getBounds.apply(this.voxels, chunk.position)
  //console.log('showChunk',chunkIndex,'density=',JSON.stringify(chunkDensity(chunk)))

  var voxelArray = isndarray(chunk) ? chunk : ndarray(chunk.voxels, chunk.dims)
  var mesh = this.rendering.stitchVoxelMesh( this.shell.gl, voxelArray, chunk.position, this.chunkPad)
  // TODO: should the above API be on game.renderer or with data management?

  if (!mesh) {
    // no voxels
    return null
  }

  this.voxels.chunks[chunkIndex] = chunk
  if (this.voxels.meshes[chunkIndex]) {
    // TODO: remove mesh if exists
    //if (this.voxels.meshes[chunkIndex].surfaceMesh) this.scene.remove(this.voxels.meshes[chunkIndex].surfaceMesh)
    //if (this.voxels.meshes[chunkIndex].wireMesh) this.scene.remove(this.voxels.meshes[chunkIndex].wireMesh)
  }
  this.voxels.meshes[chunkIndex] = mesh
  this.emit('renderChunk', chunk)
  return mesh
}

// # Misc internal methods

Game.prototype.setInterval = tic.interval.bind(tic)
Game.prototype.setTimeout = tic.timeout.bind(tic)

Game.prototype.tick = function(delta) {

  // TODO: revisit timing
  // for now, highly variable timesteps are Considered Harmful
  if (delta > 200) delta = 200

  this.controller.tick(delta)

  this.physics.tick(delta)

  // tick entities
  for(var i=0; i<this.entities.length; ++i) {
    if (this.entities[i].tick) {
      this.entities[i].tick()
    }
  }

  //if (this.materials) this.materials.tick(delta)

  if (this.pendingChunks.length) this.loadPendingChunks()
  if (Object.keys(this.chunksNeedsUpdate).length > 0) this.updateDirtyChunks()

  tic.tick(delta)

  this.emit('tick', delta)

  var playerPos = this.playerPosition()
  this.spatial.emit('position', playerPos, playerPos)
}


// TODO: merge with game-shell render loop?
Game.prototype.initializeTimer = function(rate) {
  var self = this
  var accum = 0
  var now = 0
  var last = null
  var dt = 0
  var wholeTick

  self.frameUpdated = true
  self.interval = setInterval(timer, 0)
  return self.interval

  function timer() {
    if (self.paused) {
      last = Date.now()
      accum = 0
      return
    }
    now = Date.now()
    dt = now - (last || now)
    last = now
    accum += dt
    if (accum < rate) return
    wholeTick = ((accum / rate)|0)
    if (wholeTick <= 0) return
    wholeTick *= rate

    self.tick(wholeTick)
    accum -= wholeTick

    self.frameUpdated = true
  }
}


Game.prototype.handleChunkGeneration = function() {
  var self = this
  this.voxels.on('missingChunk', function(chunkPos) {
    self.pendingChunks.push(chunkPos.join('|'))
  })
  this.voxels.requestMissingChunks(this.worldOrigin)
  this.loadPendingChunks(this.pendingChunks.length)
}

// teardown methods
Game.prototype.destroy = function() {
  clearInterval(this.timer)
}
