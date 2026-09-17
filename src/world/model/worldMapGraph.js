const undirectedEdgeKey = (a, b) => [String(a), String(b)].sort().join("\u0000");

export function collectDegreeTwoCorridors(locations) {
    const nodes = [...locations.values()];
    const adjacency = new Map(
        nodes.map((node) => [String(node.id), [...node.neighbors.keys()].map(String)]),
    );
    const visitedEdges = new Set();
    const corridors = [];

    const walk = (startId, nextId) => {
        const nodeIds = [String(startId), String(nextId)];
        const edgeKeys = [undirectedEdgeKey(startId, nextId)];
        visitedEdges.add(edgeKeys[0]);

        let previousId = String(startId);
        let currentId = String(nextId);
        while ((adjacency.get(currentId) || []).length === 2) {
            const followingId = (adjacency.get(currentId) || []).find(
                (candidateId) => candidateId !== previousId,
            );
            if (followingId == null) break;

            const key = undirectedEdgeKey(currentId, followingId);
            if (visitedEdges.has(key)) break;
            visitedEdges.add(key);
            edgeKeys.push(key);
            nodeIds.push(followingId);
            previousId = currentId;
            currentId = followingId;
        }

        corridors.push({ nodeIds, edgeKeys, length: edgeKeys.length });
    };

    for (const node of nodes) {
        const nodeId = String(node.id);
        const neighbors = adjacency.get(nodeId) || [];
        if (neighbors.length === 2) continue;
        for (const neighborId of neighbors) {
            if (!visitedEdges.has(undirectedEdgeKey(nodeId, neighborId))) {
                walk(nodeId, neighborId);
            }
        }
    }

    // A connected component made entirely of degree-two nodes is a cycle and
    // has no natural endpoint, so account for any edges not visited above.
    for (const node of nodes) {
        const nodeId = String(node.id);
        for (const neighborId of adjacency.get(nodeId) || []) {
            if (!visitedEdges.has(undirectedEdgeKey(nodeId, neighborId))) {
                walk(nodeId, neighborId);
            }
        }
    }

    return corridors;
}

export function analyzeGraph(locations, edges) {
    const nodes = [...locations.values()];
    const degrees = nodes.map((node) => node.neighbors.size);
    const unseen = new Set(nodes.map((node) => String(node.id)));
    let componentCount = 0;

    while (unseen.size) {
        componentCount++;
        const queue = [unseen.values().next().value];
        unseen.delete(queue[0]);
        while (queue.length) {
            const currentId = queue.shift();
            const current = locations.get(currentId);
            for (const neighborId of current?.neighbors.keys() || []) {
                const id = String(neighborId);
                if (!unseen.delete(id)) continue;
                queue.push(id);
            }
        }
    }

    const corridors = collectDegreeTwoCorridors(locations);
    const streetEdges = new Map();
    for (const edge of edges) {
        const streetName = String(edge.streetName || "Street");
        if (!streetEdges.has(streetName)) streetEdges.set(streetName, []);
        streetEdges.get(streetName).push(edge);
    }

    let branchingStreetCount = 0;
    for (const street of streetEdges.values()) {
        const streetDegrees = new Map();
        for (const edge of street) {
            streetDegrees.set(String(edge.a), (streetDegrees.get(String(edge.a)) || 0) + 1);
            streetDegrees.set(String(edge.b), (streetDegrees.get(String(edge.b)) || 0) + 1);
        }
        if ([...streetDegrees.values()].some((degree) => degree > 2)) {
            branchingStreetCount++;
        }
    }

    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    return {
        nodeCount,
        edgeCount,
        componentCount,
        cycleCount: edgeCount - nodeCount + componentCount,
        leafCount: degrees.filter((degree) => degree === 1).length,
        degreeTwoCount: degrees.filter((degree) => degree === 2).length,
        maxDegree: degrees.length ? Math.max(...degrees) : 0,
        averageDegree: nodeCount ? (edgeCount * 2) / nodeCount : 0,
        longestCorridor: corridors.length
            ? Math.max(...corridors.map((corridor) => corridor.length))
            : 0,
        streetCount: streetEdges.size,
        singleEdgeStreetCount: [...streetEdges.values()].filter((street) => street.length === 1)
            .length,
        longestStreetLength: streetEdges.size
            ? Math.max(...[...streetEdges.values()].map((street) => street.length))
            : 0,
        branchingStreetCount,
    };
}

export { undirectedEdgeKey };
