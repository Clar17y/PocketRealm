export interface ZoneRouteConnection {
  fromId: string;
  toId: string;
}

interface BuildAdjacencyOptions {
  bidirectional?: boolean;
}

export function buildZoneAdjacency(
  connections: ZoneRouteConnection[],
  options: BuildAdjacencyOptions = {},
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const connection of connections) {
    if (!adjacency.has(connection.fromId)) adjacency.set(connection.fromId, []);
    adjacency.get(connection.fromId)!.push(connection.toId);

    if (options.bidirectional) {
      if (!adjacency.has(connection.toId)) adjacency.set(connection.toId, []);
      adjacency.get(connection.toId)!.push(connection.fromId);
    }
  }

  return adjacency;
}

export function findShortestZonePath(
  startId: string,
  destinationId: string,
  connections: ZoneRouteConnection[],
): string[] | null {
  if (!startId || !destinationId) return null;
  if (startId === destinationId) return [startId];

  const adjacency = buildZoneAdjacency(connections);
  const queue = [startId];
  const visited = new Set<string>([startId]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;

      visited.add(neighbor);
      previous.set(neighbor, current);

      if (neighbor === destinationId) {
        const path = [destinationId];
        let cursor = destinationId;

        while (previous.has(cursor)) {
          cursor = previous.get(cursor)!;
          path.push(cursor);
        }

        path.reverse();
        return path;
      }

      queue.push(neighbor);
    }
  }

  return null;
}
