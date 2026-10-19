import {
  Frustum,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three'

// 256px is enough once the ripple distorts the sample. An 8-bit target, rather
// than half-float, does not need EXT_color_buffer_half_float — that extension
// is missing on a lot of the machines this page already struggles on, and the
// reflection pass then fails.
export const REFLECT_SIZE = 256
// The mirror does not need the far side of the city. A short camera keeps
// that second draw inside the blocks around the car.
export const REFLECT_FAR_M = 600
const CLIP_BIAS = 0.003

// A horizontal mirror on y = 0. The texture matrix projects a world-space
// point (the city shader's vCorridor) into the reflection image.
export const createMirror = () => {
  const reflector = new Object3D()
  reflector.rotation.x = -Math.PI / 2
  reflector.updateMatrixWorld()
  const renderTarget = new WebGLRenderTarget(REFLECT_SIZE, REFLECT_SIZE, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  renderTarget.texture.colorSpace = LinearSRGBColorSpace
  renderTarget.texture.generateMipmaps = false
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  return {
    reflector,
    renderTarget,
    camera: new PerspectiveCamera(),
    textureMatrix: new Matrix4(),
    scratch: {
      reflectorPlane: new Plane(),
      normal: new Vector3(),
      reflectorWorldPosition: new Vector3(),
      cameraWorldPosition: new Vector3(),
      rotationMatrix: new Matrix4(),
      lookAtPosition: new Vector3(),
      clipPlane: new Vector4(),
      view: new Vector3(),
      target: new Vector3(),
      q: new Vector4(),
    },
    dispose() { renderTarget.dispose() },
  }
}

// Aims the reflection camera and fills textureMatrix. False when the viewer
// is under the plane, where a mirror of the bay would be looking at nothing.
export const aimMirror = (camera, mirror) => {
  const { camera: reflectionCamera, textureMatrix, reflector, scratch: s } = mirror
  reflector.updateMatrixWorld()
  const {
    reflectorPlane, normal, reflectorWorldPosition, cameraWorldPosition,
    rotationMatrix, lookAtPosition, clipPlane, view, target, q,
  } = s

  reflectorWorldPosition.setFromMatrixPosition(reflector.matrixWorld)
  cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)
  rotationMatrix.extractRotation(reflector.matrixWorld)
  normal.set(0, 0, 1).applyMatrix4(rotationMatrix)

  view.subVectors(reflectorWorldPosition, cameraWorldPosition)
  if (view.dot(normal) > 0) return false

  view.reflect(normal).negate()
  view.add(reflectorWorldPosition)

  rotationMatrix.extractRotation(camera.matrixWorld)
  lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition)
  target.subVectors(reflectorWorldPosition, lookAtPosition)
  target.reflect(normal).negate()
  target.add(reflectorWorldPosition)

  reflectionCamera.fov = camera.fov
  reflectionCamera.aspect = camera.aspect
  reflectionCamera.near = camera.near
  reflectionCamera.far = Math.min(camera.far, REFLECT_FAR_M)
  reflectionCamera.position.copy(view)
  reflectionCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix)
  reflectionCamera.up.reflect(normal)
  reflectionCamera.lookAt(target)
  reflectionCamera.updateMatrixWorld()
  reflectionCamera.updateProjectionMatrix()

  textureMatrix.set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1,
  )
  textureMatrix.multiply(reflectionCamera.projectionMatrix)
  textureMatrix.multiply(reflectionCamera.matrixWorldInverse)

  reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition)
  reflectorPlane.applyMatrix4(reflectionCamera.matrixWorldInverse)
  clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant)
  const projectionMatrix = reflectionCamera.projectionMatrix
  q.set(
    (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0],
    (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5],
    -1,
    (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14],
  )
  clipPlane.multiplyScalar(2 / clipPlane.dot(q))
  projectionMatrix.elements[2] = clipPlane.x
  projectionMatrix.elements[6] = clipPlane.y
  projectionMatrix.elements[10] = clipPlane.z + 1 - CLIP_BIAS
  projectionMatrix.elements[14] = clipPlane.w
  return true
}

const viewFrustum = new Frustum()
const viewProj = new Matrix4()

// True when any of the bay meshes intersects the camera. The mirror is a full
// extra draw, so it stays off while the water is behind the car.
export const mirrorSees = (camera, meshes) => {
  if (!meshes.length) return false
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  viewFrustum.setFromProjectionMatrix(viewProj)
  for (let i = 0; i < meshes.length; i += 1) {
    const mesh = meshes[i]
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    if (viewFrustum.intersectsObject(mesh)) return true
  }
  return false
}

// Renders the city into the mirror with shadows and tone mapping off, so the
// sample stays linear and the main view tone-maps it once.
export const renderMirror = (mirror, { gl, scene, camera, meshes }) => {
  if (!aimMirror(camera, mirror)) return false
  meshes.forEach((mesh) => { mesh.visible = false })
  const tone = gl.toneMapping
  const output = gl.outputColorSpace
  const xr = gl.xr.enabled
  const shadows = gl.shadowMap.enabled
  const target = gl.getRenderTarget()
  try {
    gl.toneMapping = NoToneMapping
    gl.outputColorSpace = LinearSRGBColorSpace
    gl.xr.enabled = false
    gl.shadowMap.enabled = false
    gl.setRenderTarget(mirror.renderTarget)
    gl.state.buffers.depth.setMask(true)
    if (gl.autoClear === false) gl.clear()
    gl.render(scene, mirror.camera)
    return true
  } finally {
    gl.setRenderTarget(target)
    gl.toneMapping = tone
    gl.outputColorSpace = output
    gl.xr.enabled = xr
    gl.shadowMap.enabled = shadows
    const viewport = camera.viewport
    if (viewport !== undefined) gl.state.viewport(viewport)
    meshes.forEach((mesh) => { mesh.visible = true })
  }
}
