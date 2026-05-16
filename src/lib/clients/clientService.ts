import { getPrisma } from "../prisma.ts";
import { validateClientInput, type ClientInput } from "./clientValidation.ts";

export class ClientAccessError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function parseClientPayload(payload: unknown): ClientInput {
  const validated = validateClientInput(payload);

  if (!validated.success) {
    throw new ClientAccessError(validated.error.issues[0]?.message ?? "Invalid client data.");
  }

  return validated.data;
}

export async function listClientsForUser(userId: string, search?: string) {
  const prisma = getPrisma();
  const query = search?.trim();

  return prisma.client.findMany({
    where: {
      userId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { companyName: { contains: query, mode: "insensitive" } },
              { contactEmail: { contains: query, mode: "insensitive" } },
              { website: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          reports: true,
          scans: true,
        },
      },
    },
  });
}

export async function createClientForUser(userId: string, input: ClientInput) {
  const prisma = getPrisma();

  return prisma.client.create({
    data: {
      ...input,
      userId,
    },
  });
}

export async function updateClientForUser(
  userId: string,
  clientId: string,
  input: ClientInput,
) {
  const prisma = getPrisma();
  const result = await prisma.client.updateMany({
    where: {
      id: clientId,
      userId,
    },
    data: input,
  });

  if (result.count === 0) {
    throw new ClientAccessError("Client was not found.", 404);
  }

  return prisma.client.findFirstOrThrow({
    where: {
      id: clientId,
      userId,
    },
  });
}

export async function deleteClientForUser(userId: string, clientId: string) {
  const prisma = getPrisma();
  const result = await prisma.client.deleteMany({
    where: {
      id: clientId,
      userId,
    },
  });

  if (result.count === 0) {
    throw new ClientAccessError("Client was not found.", 404);
  }

  return { success: true };
}

export async function getOwnedClient(userId: string, clientId: string) {
  const prisma = getPrisma();

  return prisma.client.findFirst({
    where: {
      id: clientId,
      userId,
    },
  });
}
