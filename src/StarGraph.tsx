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
  const [rootKey, setRootKey] = useState<string | null>(null);

  // Load YAML and build star graph
  useEffect(() => {
    loadGraphYaml().then(({ nodes, edges }) => {
      let center: any = nodes[0];
      // If rootKey is set (from double-click), use it as center
      if (rootKey) {
        const found = nodes.find(n => n.key === rootKey);
        if (found) center = found;
      } else if (searchKey || searchLabel) {
        // If search, find match
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
  }, [searchKey, searchLabel, rootKey]);

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
        setRootKey(data.key); // set as new root
        setSearchKey("");
        setSearchLabel("");
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
      const data = node.data();
      setRootKey(data.key); // navigate to this node as root
      setSearchKey(data.key || "");
      setSearchLabel(data.label || "");
    }
  };

  if (loading) return <div>Loading graph...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#f7f8fa", display: "flex", flexDirection: "column" }}>
      {/* Top: Search Bar */}
      <div style={{ width: "100%", padding: "24px 0 12px 0", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search by key..."
            value={searchKey}
            onChange={e => setSearchKey(e.target.value)}
            style={{ padding: 8, fontSize: 16, width: 160, borderRadius: 6, border: "1px solid #d0d3d8" }}
          />
          <input
            type="text"
            placeholder="Search by label..."
            value={searchLabel}
            onChange={e => setSearchLabel(e.target.value)}
            style={{ padding: 8, fontSize: 16, width: 220, borderRadius: 6, border: "1px solid #d0d3d8" }}
          />
          <button onClick={() => { setSearchKey(""); setSearchLabel(""); }} style={{ padding: "8px 18px", fontSize: 16, borderRadius: 6, border: "none", background: "#1976d2", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Reset</button>
        </div>
      </div>
      {/* Bottom: Detail + Graph */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0 }}>
        {/* Detail Panel */}
        <div style={{ width: 340, background: "#f0f1f3", borderRight: "1.5px solid #e0e3e8", padding: "36px 28px", display: "flex", flexDirection: "column", justifyContent: "flex-start", minHeight: 0 }}>
          {info ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 22, color: "#1976d2", marginBottom: 12 }}>{info.label}</div>
              <div style={{ color: "#222", fontSize: 16, marginBottom: 18 }}><strong>Description:</strong> {info.description}</div>
              <div style={{ color: "#444", fontSize: 15 }}><strong>Key:</strong> {info.key}</div>
            </>
          ) : (
            <div style={{ color: "#888", fontSize: 16 }}>Select a node to see details</div>
          )}
        </div>
        {/* Graph Panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f1f3" }}>
          <CytoscapeComponent
            elements={elements}
            style={{ width: "100%", height: "100%" }}
            layout={CYTO_LAYOUT}
            stylesheet={CYTO_STYLE}
            cy={(cy: any) => {
              cyRef.current = cy;
              cy.on("tap", handleTap);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default StarGraph;
