import React, { useEffect, useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import { loadGraphYaml } from "./graphLoader";

const CYTO_LAYOUT = {
  name: "preset",
};

const CYTO_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      label: "data(label)",
      width: "mapData(size, 1, 10, 32, 64)",
      height: "mapData(size, 1, 10, 32, 64)",
      "font-size": 16,
      "text-valign": "center",
      "text-halign": "center",
      "color": "#222",
      "text-background-color": "#fff",
      "text-background-opacity": 1,
      "text-background-padding": 4,
      "border-width": 2,
      "border-color": "#fff",
      "z-index": 10,
    },
  },
  {
    selector: "edge",
    style: {
      width: 4,
      "line-color": "#bbb",
      "target-arrow-color": "#bbb",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
    },
  },
  {
    selector: ".highlighted",
    style: {
      "background-color": "#ffeb3b",
      "border-color": "#222",
      "border-width": 4,
      "z-index": 20,
    },
  },
];

function polarToXY(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

const StarGraph = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState("");
  const [searchLabel, setSearchLabel] = useState("");
  const cyRef = useRef<any>(null);
  const [centerNodeKey, setCenterNodeKey] = useState<string | null>(null);

  // Load YAML and build star graph
  useEffect(() => {
    loadGraphYaml().then(({ nodes, edges }) => {
      let center: any = nodes[0];
      // If search, find match
      if (searchKey || searchLabel) {
        const match = nodes.find(n => {
          const keyMatch = searchKey && n.key.toLowerCase() === searchKey.toLowerCase();
          const labelMatch = searchLabel && n.label && n.label.toLowerCase().includes(searchLabel.toLowerCase());
          if (searchKey && searchLabel) return keyMatch && labelMatch;
          if (searchKey) return keyMatch;
          if (searchLabel) return labelMatch;
          return false;
        });
        if (match) center = match;
      }
      setCenterNodeKey(center.key);
      const neighbors = edges
        .filter(e => e.source === center.key || e.target === center.key)
        .map(e => (e.source === center.key ? e.target : e.source));
      // Arrange center at (0,0), neighbors in a circle
      const R = 250;
      const angleStep = (2 * Math.PI) / Math.max(1, neighbors.length);
      const cyNodes = [
        {
          data: { ...center, id: center.key, size: center.size ?? 1, color: center.color ?? "#1976d2" },
          position: { x: 0, y: 0 },
        },
        ...neighbors.map((key, i) => {
          const n = nodes.find(n => n.key === key);
          const pos = polarToXY(0, 0, R, i * angleStep);
          return {
            data: { ...n, id: n.key, size: n.size ?? 1, color: n.color ?? "#388e3c" },
            position: pos,
          };
        }),
      ];
      // Only keep edges between center and neighbors
      const cyEdges = neighbors.map(key => {
        return {
          data: {
            id: `${center.key}-${key}`,
            source: center.key,
            target: key,
          },
        };
      });
      setElements([...cyNodes, ...cyEdges]);
      setLoading(false);
      setSelected(center.key); // always select center
      setInfo(center);
    });
  }, [searchKey, searchLabel]);

  // Center and highlight node on click or search
  useEffect(() => {
    if (!cyRef.current || !centerNodeKey) return;
    const cy = cyRef.current;
    cy.nodes().removeClass("highlighted");
    const node = cy.getElementById(centerNodeKey);
    if (node) {
      node.addClass("highlighted");
      cy.animate({ center: { eles: node }, zoom: 1 }, { duration: 400 });
    }
  }, [elements, centerNodeKey]);

  // Add double-click handler to nodes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const handleDoubleTap = (event: any) => {
      const node = event.target;
      if (node.isNode && node.isNode()) {
        const data = node.data();
        setSearchKey(data.key || "");
        setSearchLabel(data.label || "");
        setCenterNodeKey(data.key); // reload graph with this node as center
      }
    };
    cy.on("dblclick", "node", handleDoubleTap);
    // Clean up
    return () => {
      cy.removeListener("dblclick", "node", handleDoubleTap);
    };
  }, [cyRef]);

  const handleTap = (event: any) => {
    const node = event.target;
    if (node.isNode && node.isNode()) {
      setSelected(node.id());
      setInfo(node.data());
      setCenterNodeKey(node.id());
    } else {
      setSelected(null);
      setInfo(null);
    }
  };

  if (loading) return <div>Loading graph...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 700, height: 520, background: "#fff", borderRadius: 18, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: "1.5px solid #e0e3e8", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Search UI */}
        <div style={{ position: "absolute", left: 24, top: 24, zIndex: 20, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search by key..."
            value={searchKey}
            onChange={e => setSearchKey(e.target.value)}
            style={{ padding: 6, fontSize: 15, width: 120 }}
          />
          <input
            type="text"
            placeholder="Search by label..."
            value={searchLabel}
            onChange={e => setSearchLabel(e.target.value)}
            style={{ padding: 6, fontSize: 15, width: 180 }}
          />
          <button onClick={() => { setSearchKey(""); setSearchLabel(""); }} style={{ padding: 6, fontSize: 15 }}>Reset</button>
        </div>
        <CytoscapeComponent
          elements={elements}
          style={{ width: "100%", height: "100%" }}
          layout={CYTO_LAYOUT}
          stylesheet={CYTO_STYLE}
          cy={cy => {
            cyRef.current = cy;
            cy.on("tap", handleTap);
          }}
        />
        {info && (
          <div style={{ position: "absolute", right: 24, top: 24, minWidth: 260, background: "#f0f1f3", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: 0, zIndex: 30, textAlign: "left", color: "#222" }}>
            <div style={{ background: "#e0e3e8", borderTopLeftRadius: 8, borderTopRightRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 18, color: "#111" }}>{info.label}</div>
            <div style={{ padding: "18px 20px 12px 20px", color: "#222" }}>
              <p style={{ margin: "8px 0" }}><strong>Description:</strong> {info.description}</p>
              <p style={{ margin: "8px 0" }}><strong>Key:</strong> {info.key}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StarGraph;
