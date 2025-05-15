import { Request, Response, NextFunction } from "express";
import { Repository } from "../models/Repository";
import { getRepositoryTreeService } from "../services/getRepositoryTreeService";
import simpleGit from "simple-git";
import { prepareRepo } from "../utils/gitRepoUtils";
import { AppError } from "../middleware/errorHandler";
import { syncCommits } from "../services/sync/syncCommits";

/**
 * Parsea una fecha desde query params con validación segura
 */
const parseDateParam = (value: unknown, isUntil = false): Date | undefined => {
  if (!value || typeof value !== "string") return undefined;

  const dateString = isUntil
    ? `${value}T23:59:59.999Z`
    : `${value}T00:00:00.000Z`;

  const parsed = new Date(dateString);
  return isNaN(parsed.getTime()) ? undefined : parsed;
};

export const getRepositoryTree = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { repoUrl, author, since, until, branch } = req.query;

  if (!repoUrl) {
    return next(new AppError("REPO_URL_REQUIRED", undefined, 400));
  }

  try {
    const decodedRepoUrl = decodeURIComponent(repoUrl as string);
    const repo = await Repository.findOne({ where: { url: decodedRepoUrl } });

    if (!repo) {
      return next(new AppError("REPO_NOT_FOUND", undefined, 404));
    }

    const branchToUse = branch as string | undefined;
    const sinceDate = parseDateParam(since);
    const untilDate = parseDateParam(until, true);

    // ❗ Sanitizar el autor para evitar pasar string vacío
    const sanitizedAuthor =
      typeof author === "string" && author.trim() !== "" ? author.trim() : undefined;

    console.log("[💥 DEBUG] Tipos crudos de fechas:", typeof since, since, typeof until, until);
    console.log("[🧪 DEBUG PARSED] since:", sinceDate?.toISOString(), "until:", untilDate?.toISOString());
    console.log("[🧑‍💻 DEBUG] Author original:", author, "| Sanitizado:", sanitizedAuthor);

    const repoPath = await prepareRepo(decodedRepoUrl);

    if (branchToUse) {
      const git = simpleGit(repoPath);
      const branches = await git.branch(["-a"]);
      const branchExists = branches.all.some((b) =>
        b.replace("remotes/origin/", "").trim() === branchToUse
      );

      if (!branchExists) {
        return next(
          new AppError(
            "BRANCH_NOT_EXISTS_IN_REPO",
            `La rama '${branchToUse}' no existe en el repositorio.`,
            400
          )
        );
      }

      await syncCommits(repo, repoPath, branchToUse, { syncStats: true });
    }

    const tree = await getRepositoryTreeService(repo.id, {
      author: sanitizedAuthor,
      since: sinceDate,
      until: untilDate,
      repoUrl: decodedRepoUrl,
      branch: branchToUse,
      repoPath,
    });

    if (sanitizedAuthor && (!tree.files?.length && !tree.subfolders?.length)) {
      res.status(200).json({
        warning: `No hay commits realizados por el autor '${sanitizedAuthor}'.`,
        tree: [],
      });
      return;
    }

    res.status(200).json({ tree });
  } catch (error) {
    console.error("[getRepositoryTree] Error:", error);
    next(new AppError("FAILED_TO_GET_REPO_TREE"));
  }
};

export const getCurrentBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { repoUrl } = req.query;

  if (!repoUrl) {
    return next(new AppError("REPO_URL_REQUIRED", undefined, 400));
  }

  try {
    const decodedRepoUrl = decodeURIComponent(repoUrl as string);
    const repoPath = await prepareRepo(decodedRepoUrl);
    const git = simpleGit(repoPath);

    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    res.status(200).json({ currentBranch: branch.trim() });
  } catch (err) {
    console.error("Error al obtener la rama actual:", err);
    next(new AppError("FAILED_TO_GET_CURRENT_BRANCH"));
  }
};
