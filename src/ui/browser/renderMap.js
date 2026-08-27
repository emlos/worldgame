const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function projectedPositions(nodes, width, height, padding) {
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const offsetX = padding + (innerWidth - sourceWidth * scale) / 2;
  const offsetY = padding + (innerHeight - sourceHeight * scale) / 2;

  return new Map(
    nodes.map((node) => [
      node.id,
      {
        x: offsetX + (node.x - minX) * scale,
        y: offsetY + (node.y - minY) * scale,
      },
    ]),
  );
}

function boxesOverlap(left, right, gap = 3) {
  return !(
    left.right + gap < right.left ||
    left.left - gap > right.right ||
    left.bottom + gap < right.top ||
    left.top - gap > right.bottom
  );
}

function labelPlacements(nodes, positions, width, height) {
  const placements = new Map();
  const occupied = nodes.map((node) => {
    const position = positions.get(node.id);
    const radius = node.current ? 12 : node.directlyReachable ? 10 : 8;
    return {
      left: position.x - radius,
      right: position.x + radius,
      top: position.y - radius,
      bottom: position.y + radius,
    };
  });
  const labelledNodes = nodes
    .filter((node) => !node.boundary)
    .sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        Number(right.gpsDestination) - Number(left.gpsDestination) ||
        Number(right.onGpsRoute) - Number(left.onGpsRoute) ||
        Number(right.directlyReachable) - Number(left.directlyReachable) ||
        left.id.localeCompare(right.id),
    );

  for (const node of labelledNodes) {
    const position = positions.get(node.id);
    const radius = node.current ? 10 : node.directlyReachable ? 8 : 6;
    const distance = radius + 7;
    const textWidth = Math.max(24, node.name.length * 6.4);
    const textHeight = 14;
    const horizontalCandidates =
      position.x > width * 0.62
        ? [
            { x: -distance, y: 4, anchor: "end" },
            { x: distance, y: 4, anchor: "start" },
          ]
        : [
            { x: distance, y: 4, anchor: "start" },
            { x: -distance, y: 4, anchor: "end" },
          ];
    const candidates = [
      ...horizontalCandidates,
      { x: 0, y: -distance, anchor: "middle" },
      { x: 0, y: distance + textHeight, anchor: "middle" },
      { x: distance, y: -distance, anchor: "start" },
      { x: -distance, y: -distance, anchor: "end" },
      { x: distance, y: distance + textHeight, anchor: "start" },
      { x: -distance, y: distance + textHeight, anchor: "end" },
    ];

    let selected = null;
    let selectedBox = null;
    for (const candidate of candidates) {
      const anchorX = position.x + candidate.x;
      const baselineY = position.y + candidate.y;
      let left = anchorX;
      if (candidate.anchor === "end") left -= textWidth;
      else if (candidate.anchor === "middle") left -= textWidth / 2;
      const box = {
        left,
        right: left + textWidth,
        top: baselineY - textHeight + 2,
        bottom: baselineY + 3,
      };
      const inside =
        box.left >= 2 && box.right <= width - 2 && box.top >= 2 && box.bottom <= height - 2;
      if (!inside || occupied.some((other) => boxesOverlap(box, other))) continue;
      selected = candidate;
      selectedBox = box;
      break;
    }

    if (!selected) {
      selected = horizontalCandidates[0];
      const anchorX = position.x + selected.x;
      const baselineY = position.y + selected.y;
      let left = anchorX;
      if (selected.anchor === "end") left -= textWidth;
      selectedBox = {
        left,
        right: left + textWidth,
        top: baselineY - textHeight + 2,
        bottom: baselineY + 3,
      };
    }

    placements.set(node.id, selected);
    occupied.push(selectedBox);
  }

  return placements;
}

function nodeDescription(node) {
  const placeNames = node.places.map((place) => place.name);
  const places = placeNames.length ? ` Places: ${placeNames.join(", ")}.` : "";
  const route = node.directlyReachable ? " Directly reachable." : "";
  const gps = node.gpsDestination
    ? " GPS destination."
    : node.onGpsRoute
      ? " On the GPS route."
      : "";
  return `${node.name}.${route}${gps}${places}`;
}

function edgeDescription(edge) {
  return `${edge.streetName}, ${edge.minutes} minute${edge.minutes === 1 ? "" : "s"}`;
}

export function renderMap(host, mapView, { onSelectNode = null } = {}) {
  host.replaceChildren();
  if (!mapView?.nodes?.length) return null;

  const isWorldMap = mapView.scope === "world";
  const width = isWorldMap ? 1100 : 760;
  const height = isWorldMap ? 580 : 360;
  const padding = isWorldMap ? 48 : 40;
  const positions = projectedPositions(mapView.nodes, width, height, padding);
  const labels = labelPlacements(mapView.nodes, positions, width, height);
  const nodesById = new Map(mapView.nodes.map((node) => [node.id, node]));
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": isWorldMap
      ? "Complete world map"
      : "Nearby locations up to three street connections away",
  });
  svg.classList.add("graph-map", isWorldMap ? "graph-map--world" : "graph-map--local");

  const edgeLayer = svgElement("g", { "aria-hidden": "true" });
  edgeLayer.classList.add("map-edges");
  for (const edge of mapView.edges) {
    const start = positions.get(edge.a);
    const end = positions.get(edge.b);
    if (!start || !end) continue;

    const line = svgElement("line", {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    });
    line.classList.add("map-edge");
    if (edge.directlyReachable) line.classList.add("map-edge--direct");
    if (edge.onGpsRoute) line.classList.add("map-edge--gps");
    if (nodesById.get(edge.a)?.boundary || nodesById.get(edge.b)?.boundary) {
      line.classList.add("map-edge--boundary");
    }
    const title = svgElement("title");
    title.textContent = edgeDescription(edge);
    line.append(title);
    edgeLayer.append(line);
  }
  svg.append(edgeLayer);

  const nodeLayer = svgElement("g");
  nodeLayer.classList.add("map-nodes");
  for (const node of mapView.nodes) {
    const position = positions.get(node.id);
    const group = svgElement("g", {
      transform: `translate(${position.x} ${position.y})`,
      tabindex: onSelectNode && !node.boundary ? 0 : -1,
    });
    group.classList.add("map-node");
    if (node.current) group.classList.add("map-node--current");
    else if (node.directlyReachable) group.classList.add("map-node--reachable");
    if (node.onGpsRoute) group.classList.add("map-node--gps-route");
    if (node.gpsDestination) group.classList.add("map-node--gps-destination");
    if (node.boundary) group.classList.add("map-node--boundary");

    if (onSelectNode && !node.boundary) {
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", nodeDescription(node));
      group.addEventListener("click", () => onSelectNode(node));
      group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectNode(node);
      });
    }

    const title = svgElement("title");
    title.textContent = nodeDescription(node);
    group.append(title);

    const circle = svgElement("circle", {
      r: node.current ? 10 : node.boundary ? 4 : node.directlyReachable ? 8 : 6,
    });
    group.append(circle);

    if (!node.boundary) {
      const placement = labels.get(node.id);
      const label = svgElement("text", {
        x: placement.x,
        y: placement.y,
        "text-anchor": placement.anchor,
      });
      label.textContent = node.name;
      group.append(label);
    }

    nodeLayer.append(group);
  }
  svg.append(nodeLayer);
  host.append(svg);
  return svg;
}
