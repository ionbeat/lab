import yaml from 'js-yaml';

export async function loadGraphYaml(): Promise<{ nodes: any[]; edges: any[] }> {
  const res = await fetch('/src/graph.yaml');
  const text = await res.text();
  return yaml.load(text) as { nodes: any[]; edges: any[] };
}
