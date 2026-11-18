// viewer/ply_loader.js — Reference PLY parser module
// (The main parser is embedded in index.html for zero-dependency deployment)

/**
 * Parse a binary PLY file and return points + colors.
 * Auto-detects property layout (handles xyz, normals, rgb in any order).
 */
async function loadPLY(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    const headerText = new TextDecoder().decode(buffer.slice(0, 4096));
    const headerEndIdx = headerText.indexOf('end_header');
    if (headerEndIdx === -1) throw new Error('Invalid PLY: no end_header');
    const headerBytes = new TextEncoder().encode(
        headerText.substring(0, headerEndIdx + 'end_header'.length)
    );
    const headerEnd = headerBytes.length + 1;

    const vertexCountMatch = headerText.match(/element vertex (\d+)/);
    if (!vertexCountMatch) throw new Error('No vertex count');
    const vertexCount = parseInt(vertexCountMatch[1]);

    // Parse property definitions to compute stride and offsets
    const propLines = headerText.split('\n').filter(l => l.startsWith('property'));
    let stride = 0;
    const props = [];
    for (const line of propLines) {
        const parts = line.trim().split(/\s+/);
        const type = parts[1];
        const name = parts[2];
        let size;
        if (type === 'float' || type === 'float32' || type === 'int' || type === 'int32') size = 4;
        else if (type === 'double' || type === 'float64') size = 8;
        else if (type === 'uchar' || type === 'uint8' || type === 'char' || type === 'int8') size = 1;
        else if (type === 'short' || type === 'int16' || type === 'ushort' || type === 'uint16') size = 2;
        else size = 4;
        props.push({ name, type, offset: stride, size });
        stride += size;
    }

    const getProp = (name) => props.find(p => p.name === name);
    const xProp = getProp('x'), yProp = getProp('y'), zProp = getProp('z');
    const rProp = getProp('red'), gProp = getProp('green'), bProp = getProp('blue');

    const dataView = new DataView(buffer, headerEnd);
    const points = [];
    const colors = [];

    for (let i = 0; i < vertexCount; i++) {
        const base = i * stride;
        points.push(
            dataView.getFloat32(base + xProp.offset, true),
            dataView.getFloat32(base + yProp.offset, true),
            dataView.getFloat32(base + zProp.offset, true)
        );
        if (rProp && gProp && bProp) {
            if (rProp.size === 1) {
                colors.push(
                    dataView.getUint8(base + rProp.offset) / 255,
                    dataView.getUint8(base + gProp.offset) / 255,
                    dataView.getUint8(base + bProp.offset) / 255
                );
            } else {
                colors.push(
                    dataView.getFloat32(base + rProp.offset, true),
                    dataView.getFloat32(base + gProp.offset, true),
                    dataView.getFloat32(base + bProp.offset, true)
                );
            }
        } else {
            colors.push(0.7, 0.7, 0.7);
        }
    }

    return { points, colors, vertexCount };
}
