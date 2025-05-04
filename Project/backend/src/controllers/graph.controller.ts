import { Request, Response, RequestHandler } from 'express';
import { getRepoGraphService } from '../services/graph.service';

export const getRepoGraphController: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  console.log("[GRAPH] Query recibida:", req.query); 
  const repoUrl = req.query.repoUrl as string;

  if (!repoUrl) {
    res.status(400).json({ error: 'Falta el parámetro url' });
    return;
  }

  try {
    const graph = await getRepoGraphService(repoUrl);
    res.json(graph);
  } catch (error: any) {
    console.error(`[getRepoGraphController] Error:`, error);
    res.status(500).json({ error: 'Error al procesar el repositorio' });
  }
};
