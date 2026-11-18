// viewer/split_view.js
let splitMode = false;
let originalScene = null;
let completedScene = null;

function toggleSplitView() {
  splitMode = !splitMode;

  if (splitMode) {
    // Render two viewports side by side
    renderer.setScissorTest(true);

    // Left half: original (with gaps)
    const w = window.innerWidth / 2;
    const h = window.innerHeight;
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.render(scene, camera);

    // Right half: completed (no gaps)
    renderer.setViewport(w, 0, w, h);
    renderer.setScissor(w, 0, w, h);
    gapMeshes.forEach(m => m.visible = false);
    renderer.render(scene, camera);
    gapMeshes.forEach(m => m.visible = true);
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}
