async function loadGaps(gapsJsonUrl) {
    const response = await fetch(gapsJsonUrl);
    const gapsJson = await response.json();
    const gaps = Array.isArray(gapsJson) ? gapsJson : gapsJson.gaps;
    if (!Array.isArray(gaps)) {
        throw new Error('Gap JSON must be an array or an object with a gaps array');
    }
    
    // For each gap, create a red sphere at gap.center
    gaps.forEach(gap => {
        const sphere = createSphere(gap.center, Math.cbrt(gap.size ?? gap.size_m3 ?? 1) * 0.1);
        sphere.material.color = new THREE.Color(1, 0, 0);  // Red
        sphere.material.opacity = 0.5;
        sphere.material.transparent = true;
        scene.add(sphere);
    });
}

function createSphere(center, radius) {
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial();
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(center[0], center[1], center[2]);
    return sphere;
}
