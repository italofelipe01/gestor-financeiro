/** Chamada a API do proprio servidor. Erro HTTP vira exception com a mensagem que o servidor mandou. */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor do app. Ele está rodando?');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `O servidor respondeu ${response.status}.`);
  }
  return data as T;
}
