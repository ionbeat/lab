import React, { useEffect, useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import { loadGraphYaml } from "./graphLoader";
import yaml from "js-yaml";

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
      "text-background-opacity": 0.7,
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
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState("");
  const [searchLabel, setSearchLabel] = useState("");
  const cyRef = useRef<any>(null);
  const [centerNodeKey, setCenterNodeKey] = useState<string | null>(null);
  const [rootKey, setRootKey] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState(false);

  // Load YAML and build star graph
  useEffect(() => {
    loadGraphYaml().then(({ nodes, edges }) => {
      let center: any = nodes[0];
      let found = true;
      // Helper to convert wildcard search to regex
      const wildcardToRegex = (pattern: string) => {
        // Escape regex special chars except *
        const esc = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
        return new RegExp('^' + esc.replace(/\*/g, '.*') + '$', 'i');
      };
      if (rootKey) {
        const f = nodes.find(n => n.key === rootKey);
        if (f) center = f;
        else found = false;
      } else if (searchKey || searchLabel) {
        let match;
        if (searchKey && searchKey.includes('*')) {
          const keyRegex = wildcardToRegex(searchKey);
          match = nodes.find(n => keyRegex.test(n.key));
        } else if (searchKey) {
          match = nodes.find(n => n.key.toLowerCase() === searchKey.toLowerCase());
        }
        if (!match && searchLabel) {
          if (searchLabel.includes('*')) {
            const labelRegex = wildcardToRegex(searchLabel);
            match = nodes.find(n => n.label && labelRegex.test(n.label));
          } else {
            match = nodes.find(n => n.label && n.label.toLowerCase().includes(searchLabel.toLowerCase()));
          }
        }
        if (match) center = match;
        else found = false;
      }
      setNoMatch(!found);
      if (!found) {
        setElements([]);
        setInfo(null);
        setCenterNodeKey(null);
        setLoading(false);
        return;
      }
      setCenterNodeKey(center.key);
      const neighbors = edges
        .filter(e => e.source === center.key || e.target === center.key)
        .map(e => (e.source === center.key ? e.target : e.source));
      // If leaf node (no neighbors), still allow reset/search to work
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

  // Download current graph as YAML
  const handleDownloadYaml = async () => {
    // Use the latest loaded YAML if available, else reconstruct from elements
    let graphData;
    if (elements.length > 0) {
      // Reconstruct nodes and edges from elements
      const nodes = elements.filter(e => e.data && e.data.id && !e.data.source).map(e => ({
        key: e.data.key,
        label: e.data.label,
        description: e.data.description,
      }));
      const edges = elements.filter(e => e.data && e.data.source && e.data.target).map(e => ({
        source: e.data.source,
        target: e.data.target,
      }));
      graphData = { nodes, edges };
    } else {
      graphData = await loadGraphYaml();
    }
    const yamlStr = yaml.dump(graphData);
    const blob = new Blob([yamlStr], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph.yaml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Upload new YAML file (send to backend to overwrite graph.yaml)
  const handleUploadYaml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    fetch("http://localhost:3001/upload-graph", {
      method: "POST",
      body: formData,
    })
      .then(async res => {
        if (!res.ok) throw new Error("Upload failed");
        // Optionally reload the graph after upload
        setRootKey(null);
        setSearchKey("");
        setSearchLabel("");
        setTimeout(() => window.location.reload(), 500); // reload page to get new YAML
      })
      .catch(() => {
        alert("Upload failed");
      });
  };

  if (loading) return <div>Loading graph...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#f7f8fa", display: "flex", flexDirection: "column" }}>
      {/* Top: Search Bar */}
      <div style={{ width: "100%", padding: "24px 0 12px 0", background: "#f0f1f3", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginLeft: 32 }}>
          <input
            type="text"
            placeholder="Search by key..."
            value={searchKey}
            onChange={e => { setSearchKey(e.target.value); setRootKey(null); }}
            style={{ padding: 8, fontSize: 16, width: 160, borderRadius: 6, border: "1px solid #d0d3d8" }}
          />
          <input
            type="text"
            placeholder="Search by label..."
            value={searchLabel}
            onChange={e => { setSearchLabel(e.target.value); setRootKey(null); }}
            style={{ padding: 8, fontSize: 16, width: 220, borderRadius: 6, border: "1px solid #d0d3d8" }}
          />
          <button onClick={() => { setSearchKey(""); setSearchLabel(""); setRootKey(null); }} style={{ padding: "8px 18px", fontSize: 16, borderRadius: 6, border: "none", background: "#1976d2", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Reset</button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginRight: 32 }}>
          <button onClick={handleDownloadYaml} style={{ height: 44, padding: "0 24px", fontSize: 16, borderRadius: 6, border: "none", background: "#388e3c", color: "#fff", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center" }}>Download YAML</button>
          <label style={{ height: 44, padding: "0 24px", fontSize: 16, borderRadius: 6, border: "none", background: "#ff9800", color: "#fff", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center" }}>
            Upload YAML
            <input type="file" accept=".yaml,.yml" style={{ display: "none" }} onChange={handleUploadYaml} />
          </label>
        </div>
      </div>
      {/* Bottom: Detail + Graph */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, gap: 4 }}>
        {/* Detail Panel */}
        <div style={{ width: 340, background: "#f0f1f3", borderRight: "1.5px solid #d3d6db", padding: "36px 28px", display: "flex", flexDirection: "column", justifyContent: "flex-start", minHeight: 0, borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", marginRight: 4 }}>
          {info ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 22, color: "#1976d2", marginBottom: 12 }}>{info.label}</div>
              <div style={{ borderBottom: "1.5px solid #d3d6db", marginBottom: 18 }}></div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: 0, border: "1px solid #ececec", borderRadius: 6, background: "rgba(255,255,255,0.7)", marginBottom: 18 }}>
                <div style={{ borderBottom: "1px solid #ececec", borderRight: "1px solid #ececec", padding: "10px 12px", color: "#444", fontWeight: 600, background: "#f7f8fa" }}>Key</div>
                <div style={{ borderBottom: "1px solid #ececec", padding: "10px 12px", color: "#222" }}>{info.key}</div>
                <div style={{ borderRight: "1px solid #ececec", padding: "10px 12px", color: "#444", fontWeight: 600, background: "#f7f8fa" }}>Description</div>
                <div style={{ padding: "10px 12px", color: "#222" }}>{info.description}</div>
              </div>
            </>
          ) : (
            <div style={{ color: "#888", fontSize: 16 }}>Select a node to see details</div>
          )}
        </div>
        {/* Graph Panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f1f3", position: "relative", borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1.5px solid #d3d6db" }}>
          {/* Zoom Controls */}
          {/* ...existing code... */}
          {noMatch ? (
            <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              <span style={{ fontSize: 38, color: "#bbb", fontWeight: 600, letterSpacing: 1 }}>No application found</span>
            </div>
          ) : null}
          {!noMatch && (
            <CytoscapeComponent
              elements={elements}
              style={{ width: "100%", height: "100%" }}
              layout={CYTO_LAYOUT}
              stylesheet={CYTO_STYLE}
              cy={(cy: any) => {
                cyRef.current = cy;
                cy.on("tap", (event: any) => {
                  const node = event.target;
                  if (node.isNode && node.isNode()) {
                    const data = node.data();
                    setRootKey(data.key); // navigate to this node as root
                    setSearchKey("");
                    setSearchLabel("");
                  }
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default StarGraph;
