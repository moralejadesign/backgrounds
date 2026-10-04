import * as THREE from 'three'

// Dibuja el efecto en el buffer actual del renderer: directo, o pasando por el desenfoque.
// Lo usan el preview, el export PNG y el export de video.
export function draw(renderer, material, pipeline, { effect, params, view, format }) {
  const blur = (params.blur ?? 0) / 100
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  if (blur > 0) {
    pipeline.render(renderer, material, {
      view,
      outW: size.x,
      outH: size.y,
      aspect: format.w / format.h,
      blur,
      grain: effect.grainOf(params),
      grainRes: material.uniforms.uGrainRes.value,
      seed: params.seed ?? 0,
    })
  } else {
    material.uniforms.uView.value.copy(view)
    material.uniforms.uGrainOn.value = 1
    material.uniforms.uDitherPass.value = 1
    pipeline.pass(renderer, material, null)
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
