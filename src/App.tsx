import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import zoomInIcon from "./assets/zoom-in.png";
import zoomOutIcon from "./assets/zoom-out.png";
import "./App.css";
import { loadGraphYaml } from "./graphLoader";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const [searchKey, setSearchKey] = useState("");
  const [searchLabel, setSearchLabel] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [yamlFileName, setYamlFileName] = useState("graph.yaml");

  // Constants and bbox util now inside App
  const minRatio = 0.2,
    maxRatio = 2.5;
  const VIEWPORT_WIDTH = 1024;
  const VIEWPORT_HEIGHT = 768;
  const MARGIN = 120;
  const getGraphBBox = () => {
    if (nodes.length === 1) {
      const n = nodes[0];
      // Provide a small bbox around the single node
      return {
        minX: n.x - 1,
        maxX: n.x + 1,
        minY: n.y - 1,
        maxY: n.y + 1,
      };
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });
    return { minX, maxX, minY, maxY };
  };

  // Fit graph to viewport
  const fitGraphToViewport = () => {
    if (!rendererRef.current) return;
    const camera = rendererRef.current.getCamera();
    const { minX, maxX, minY, maxY } = getGraphBBox();
    // Compute graph size
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    // Compute scale to fit graph in viewport (with margin)
    const scaleX = (VIEWPORT_WIDTH - 2 * MARGIN) / graphWidth;
    const scaleY = (VIEWPORT_HEIGHT - 2 * MARGIN) / graphHeight;
    const scale = Math.min(scaleX, scaleY);
    // Sigma ratio is inverse of scale
    const ratio = 1 / scale;
    // Center of graph
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    camera.setState({ x, y, ratio });
  };

  // Strict camera clamping
  const clampCamera = () => {
    if (!rendererRef.current) return;
    const camera = rendererRef.current.getCamera();
    let { x, y, ratio } = camera.getState();
    const { minX, maxX, minY, maxY } = getGraphBBox();
    // Compute visible area in graph coordinates
    const viewWidth = VIEWPORT_WIDTH * ratio;
    const viewHeight = VIEWPORT_HEIGHT * ratio;
    // Clamp so the graph bounding box is always inside the viewport
    const minCamX = minX + viewWidth / 2;
    const maxCamX = maxX - viewWidth / 2;
    const minCamY = minY + viewHeight / 2;
    const maxCamY = maxY - viewHeight / 2;
    // If graph is smaller than viewport, center it
    const clamp = (val: number, min: number, max: number) =>
      min > max ? (min + max) / 2 : Math.max(min, Math.min(max, val));
    const clampedX = clamp(x, minCamX, maxCamX);
    const clampedY = clamp(y, minCamY, maxCamY);
    const clampedRatio = Math.max(minRatio, Math.min(maxRatio, ratio));
    // Only set state if changed
    if (x !== clampedX || y !== clampedY || ratio !== clampedRatio) {
      camera.setState({ x: clampedX, y: clampedY, ratio: clampedRatio });
    }
  };

  // Zoom in/out handlers
  const handleZoom = (delta: number) => {
    if (rendererRef.current) {
      const camera = rendererRef.current.getCamera();
      let { x, y, ratio } = camera.getState();
      let newRatio = ratio * delta;
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
      // Prevent zooming out so far that the graph disappears
      if (newRatio !== ratio) {
        camera.setState({ x, y, ratio: newRatio });
        setTimeout(clampCamera, 0); // Clamp after zoom
      }
    }
  };

  // Compute star subgraph for search match
  const [starNodes, setStarNodes] = useState<any[]>([]);
  const [starEdges, setStarEdges] = useState<any[]>([]);

  useEffect(() => {
    if (!searchKey && !searchLabel) {
      setStarNodes([]);
      setStarEdges([]);
      return;
    }
    const match = nodes.find((n) => {
      const keyMatch = searchKey && n.key.toLowerCase() === searchKey.toLowerCase();
      const labelMatch = searchLabel && n.label && n.label.toLowerCase().includes(searchLabel.toLowerCase());
      if (searchKey && searchLabel) {
        return keyMatch && labelMatch;
      } else if (searchKey) {
        return keyMatch;
      } else if (searchLabel) {
        return labelMatch;
      }
      return false;
    });
    if (!match) {
      setStarNodes([]);
      setStarEdges([]);
      return;
    }
    // Center node at (0,0)
    const centerNode = { ...match, x: 0, y: 0 };
    // Find neighbors
    const connectedEdges = edges.filter(
      (e) => e.source === match.key || e.target === match.key
    );
    const neighborKeys = connectedEdges.map((e) =>
      e.source === match.key ? e.target : e.source
    );
    // Arrange neighbors in a circle
    const angleStep = (2 * Math.PI) / Math.max(1, neighborKeys.length);
    const radius = 8; // distance from center
    const neighborNodes = neighborKeys.map((key, i) => {
      const orig = nodes.find((n) => n.key === key);
      return {
        ...orig,
        x: radius * Math.cos(i * angleStep),
        y: radius * Math.sin(i * angleStep),
      };
    });
    // Only keep edges between center and neighbors
    const starEdges = neighborKeys.map((key) => {
      return connectedEdges.find(
        (e) => (e.source === match.key && e.target === key) || (e.target === match.key && e.source === key)
      );
    }).filter(Boolean);
    // Only keep valid neighbor nodes
    const validNeighborNodes = neighborNodes.filter(n => n && n.key);
    setStarNodes([centerNode, ...validNeighborNodes]);
    setStarEdges(starEdges);
  }, [searchKey, searchLabel, nodes, edges]);

  useEffect(() => {
    loadGraphYaml().then(({ nodes, edges }) => {
      setNodes(nodes);
      setEdges(edges);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading || starNodes.length === 0) return;
    const graph = new Graph();
    starNodes.forEach((n) => graph.addNode(n.key, n));
    starEdges.forEach((e, i) => graph.addEdge(e.source, e.target, { key: `e${i}` }));
    graphRef.current = graph;

    if (containerRef.current) {
      rendererRef.current = new Sigma(graph, containerRef.current, {
        renderLabels: true,
        // Custom rendering for nodes and edges
        nodeReducer: (node, attrs) => {
          // Highlighted node
          if (attrs.highlighted) {
            return {
              ...attrs,
              color: attrs.color || "#ffeb3b",
              size: attrs.size ? attrs.size * 2.2 : 22,
              label: attrs.label,
              labelFont: "bold 22px sans-serif",
              labelColor: "#fff",
              labelBackground: "#222",
              labelBackgroundPadding: 6,
              labelBackgroundBorderRadius: 6,
              borderColor: "#fff",
              borderSize: 4,
              zIndex: 10,
              shadowColor: "#222",
              shadowBlur: 12,
            };
          }
          // Neighbor node
          if (attrs.labelFontWeight === "bold") {
            return {
              ...attrs,
              color: attrs.color,
              size: attrs.size ? attrs.size * 1.4 : 14,
              label: attrs.label,
              labelFont: "bold 16px sans-serif",
              labelColor: "#fff",
              labelBackground: "#222",
              labelBackgroundPadding: 4,
              labelBackgroundBorderRadius: 5,
              borderColor: "#fff",
              borderSize: 2,
              zIndex: 5,
              shadowColor: "#222",
              shadowBlur: 8,
            };
          }
          // Default node
          return {
            ...attrs,
            color: attrs.color,
            size: attrs.size,
            label: attrs.label,
            labelFont: "14px sans-serif",
            labelColor: "#fff",
            labelBackground: "#222",
            labelBackgroundPadding: 2,
            labelBackgroundBorderRadius: 4,
            borderColor: "#fff",
            borderSize: 1,
            zIndex: 1,
            shadowColor: "#222",
            shadowBlur: 4,
          };
        },
        edgeReducer: (edge, attrs) => {
          // Highlighted edge
          if (attrs.color === "#ff9800") {
            return {
              ...attrs,
              color: "#ff9800",
              size: 5.5,
              zIndex: 10,
            };
          }
          // Default edge
          return {
            ...attrs,
            color: "#bbb",
            size: 2,
            zIndex: 1,
          };
        },
      });
      // Only block touch pan/zoom (allow mouse drag pan, and allow mouse wheel zoom if desired)
      const container = containerRef.current;
      container.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
      // Fit graph to viewport on mount
      setTimeout(fitGraphToViewport, 0);
      // Clamp camera on update
      rendererRef.current.getCamera().on("updated", clampCamera);
      rendererRef.current.on("clickNode", ({ node }) => {
        const n = graph.getNodeAttributes(node);
        setSearchKey(n.key);
        setSearchLabel(n.label || "");
        setSelectedNode(node);
        setNodeInfo(n);
      });
      rendererRef.current.on("clickStage", () => {
        setSelectedNode(null);
        setNodeInfo(null);
      });
    }
    return () => {
      rendererRef.current?.kill();
    };
  }, [starNodes, starEdges, loading]);

  // Highlight node if search matches
  useEffect(() => {
    if (loading) return;
    const graph = graphRef.current;
    if (!graph) return;
    // Reset all nodes and edges
    graph.forEachNode((key) => {
      const orig = nodes.find((n) => n.key === key);
      graph.setNodeAttribute(key, "color", orig?.color || "#888");
      graph.setNodeAttribute(key, "size", orig?.size || 8);
      graph.removeNodeAttribute(key, "highlighted");
      graph.removeNodeAttribute(key, "labelFontWeight");
      graph.removeNodeAttribute(key, "labelSize");
    });
    graph.forEachEdge((key) => {
      graph.setEdgeAttribute(key, "color", "#bbb");
      graph.setEdgeAttribute(key, "size", 1.5);
    });
    // Highlight by search or selection
    let highlightKey: string | null = null;
    if (searchKey || searchLabel) {
      highlightKey = graph.nodes().find((key) => {
        const nodeLabel = graph.getNodeAttribute(key, "label")?.toLowerCase() || "";
        const nodeKey = key.toLowerCase();
        const keyMatch = searchKey && nodeKey === searchKey.toLowerCase();
        const labelMatch = searchLabel && nodeLabel.includes(searchLabel.toLowerCase());
        if (searchKey && searchLabel) return keyMatch && labelMatch;
        if (searchKey) return keyMatch;
        if (searchLabel) return labelMatch;
        return false;
      }) || null;
      // Show detail popup for search match
      if (highlightKey) {
        setSelectedNode(highlightKey);
        setNodeInfo(nodes.find((n) => n.key === highlightKey));
      } else {
        setSelectedNode(null);
        setNodeInfo(null);
      }
    } else if (selectedNode) {
      highlightKey = selectedNode;
    }
    if (highlightKey) {
      // Highlight node
      graph.setNodeAttribute(highlightKey, "color", "#ffeb3b");
      graph.setNodeAttribute(highlightKey, "size", 28);
      graph.setNodeAttribute(highlightKey, "highlighted", true);
      graph.setNodeAttribute(highlightKey, "labelFontWeight", "bold");
      graph.setNodeAttribute(highlightKey, "labelSize", 24);
      // Highlight neighbors and edges
      graph.forEachNeighbor(highlightKey, (neighbor) => {
        graph.setNodeAttribute(neighbor, "color", "#1976d2");
        graph.setNodeAttribute(neighbor, "size", 18);
        graph.setNodeAttribute(neighbor, "labelFontWeight", "bold");
        graph.setNodeAttribute(neighbor, "labelSize", 18);
      });
      graph.forEachEdge((edge, _attrs, source, target) => {
        if (source === highlightKey || target === highlightKey) {
          graph.setEdgeAttribute(edge, "color", "#ff9800");
          graph.setEdgeAttribute(edge, "size", 4.5);
        }
      });
    }
  }, [searchKey, searchLabel, nodes, loading, selectedNode]);

  // Assign positions dynamically if missing (for general/circular layout)
  useEffect(() => {
    if (nodes.length === 0) return;
    // If in star mode, let starNodes logic handle positions
    if (searchKey || searchLabel) return;
    // Assign circular layout
    const n = nodes.length;
    const radius = 10;
    setNodes(nodes.map((node, i) => ({
      ...node,
      x: radius * Math.cos((2 * Math.PI * i) / n),
      y: radius * Math.sin((2 * Math.PI * i) / n),
    })));
  }, [nodes.length, searchKey, searchLabel]);

  if (loading) return <div>Loading graph...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#fff", margin: 0, padding: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1024, minWidth: 1024, maxWidth: 1024, height: 768, minHeight: 768, maxHeight: 768, background: "#fff", boxSizing: "border-box", display: "flex", flexDirection: "column", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", position: "relative" }}>
        <div style={{ width: "100%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
          <h2 style={{ textAlign: "left", margin: 0, padding: "16px 32px" }}>Business Applications Ontology</h2>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: 16, paddingLeft: 32, gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              {/* Download YAML link */}
              <a
                href={"/src/graph.yaml"}
                download={yamlFileName}
                style={{ fontSize: 15, color: "#1976d2", textDecoration: "underline" }}
              >
                {yamlFileName}
              </a>
              {/* Upload YAML button */}
              <input
                type="file"
                accept=".yaml,.yml"
                style={{ display: "inline-block" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setYamlFileName(file.name);
                  const text = await file.text();
                  try {
                    const yaml = (await import("js-yaml")).default;
                    const data = yaml.load(text) as { nodes: any[]; edges: any[] };
                    setNodes(data.nodes || []);
                    setEdges(data.edges || []);
                    setSearchKey("");
                    setSearchLabel("");
                    setSelectedNode(null);
                    setNodeInfo(null);
                  } catch (err) {
                    alert("Invalid YAML file.");
                  }
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="text"
                placeholder="Search by key..."
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                style={{ padding: 8, fontSize: 16, width: 140, marginRight: 8 }}
              />
              <input
                type="text"
                placeholder="Search by label..."
                value={searchLabel}
                onChange={(e) => setSearchLabel(e.target.value)}
                style={{ padding: 8, fontSize: 16, width: 220, marginRight: 8 }}
              />
              <button
                onClick={() => {
                  setSearchKey("");
                  setSearchLabel("");
                  setSelectedNode(null);
                  setNodeInfo(null);
                }}
                style={{ padding: 8, fontSize: 16 }}
              >
                Reset
              </button>
            </div>
            {/* Search status message */}
            <div style={{ minHeight: 24, fontSize: 15, color: '#444', marginTop: 2 }}>
              {(() => {
                if (!searchKey && !searchLabel) return null;
                const match = nodes.find(n => {
                  const keyMatch = searchKey && n.key.toLowerCase() === searchKey.toLowerCase();
                  const labelMatch = searchLabel && n.label && n.label.toLowerCase().includes(searchLabel.toLowerCase());
                  if (searchKey && searchLabel) return keyMatch && labelMatch;
                  if (searchKey) return keyMatch;
                  if (searchLabel) return labelMatch;
                  return false;
                });
                if (match) return <span>Matched: <b>{match.key} - {match.label}</b></span>;
                return <span style={{ color: '#b00' }}>No matching node found</span>;
              })()}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", width: "100%", height: "100%", position: "relative" }}>
          {/* Detail popup under search input */}
          {nodeInfo && (
            <div
              style={{
                position: "absolute",
                top: 90, // just below the search bar (header + search input)
                left: 40, // align with search input
                minWidth: 320,
                background: "#f0f1f3",
                border: "1px solid #ddd",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                padding: 0,
                zIndex: 30,
                textAlign: "left",
                color: "#222"
              }}
            >
              <div style={{
                background: "#e0e3e8",
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                padding: "12px 20px",
                fontWeight: 600,
                fontSize: 18,
                color: "#111"
              }}>{nodeInfo.label}</div>
              <div style={{ padding: "18px 20px 12px 20px", color: "#222" }}>
                <p style={{ margin: "8px 0" }}><strong>Description:</strong> {nodeInfo.description}</p>
                <p style={{ margin: "8px 0" }}><strong>Key:</strong> {selectedNode}</p>
                <button
                  style={{ marginTop: 12, padding: "6px 16px", background: "#eee", border: "none", borderRadius: 4, cursor: "pointer", color: "#222" }}
                  onClick={() => { setSelectedNode(null); setNodeInfo(null); }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
          <div style={{ flex: 1, height: "100%", background: "#fff", position: "relative", boxSizing: "border-box", display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
            {starNodes.length > 0 && (
              <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            )}
            {/* Zoom controls with PNG icons */}
            {starNodes.length > 0 && (
              <div style={{ position: "absolute", left: 24, bottom: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 20 }}>
                <button onClick={() => handleZoom(1 / 1.2)} style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #bbb", background: "#fff", cursor: "pointer", marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom in">
                  <img src={zoomInIcon} alt="Zoom in" style={{ width: 24, height: 24 }} />
                </button>
                <button onClick={() => handleZoom(1.2)} style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #bbb", background: "#fff", cursor: "pointer", display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom out">
                  <img src={zoomOutIcon} alt="Zoom out" style={{ width: 24, height: 24 }} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
