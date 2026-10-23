import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { normalizePhone } from "@nivaran/shared";

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  roles: string[];
  email?: string | undefined;
  phone?: string | undefined;
  tenantId?: string | undefined;
}

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (identifier: string, pass: string, tenantSlug: string) => Promise<void>;
  register: (payload: {
    name: string;
    identifier: string;
    pass: string;
    tenantSlug: string;
    consent: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Attempt cookie refresh on mount
  useEffect(() => {
    fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: { user: UserProfile; accessToken: string } } | null) => {
        if (data?.data) {
          setUser(data.data.user);
          setToken(data.data.accessToken);
        }
      })
      .catch(() => {
        // Not logged in or refresh cookie expired
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (identifier: string, pass: string, tenantSlug: string) => {
    const isEmail = identifier.includes("@");
    const normalizedIdentifier = isEmail ? identifier.trim() : normalizePhone(identifier.trim());

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tenantSlug,
        identifier: normalizedIdentifier,
        password: pass,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Login failed");
    }

    setUser(data.data.user);
    setToken(data.data.accessToken);
  };

  const register = async (payload: {
    name: string;
    identifier: string;
    pass: string;
    tenantSlug: string;
    consent: boolean;
  }) => {
    if (!payload.consent) {
      throw new Error("Consent is mandatory to create an account");
    }

    const isEmail = payload.identifier.includes("@");
    const body: Record<string, unknown> = {
      tenantSlug: payload.tenantSlug,
      name: payload.name.trim(),
      password: payload.pass,
      consent: true,
      locale: "en",
    };

    if (isEmail) {
      body["email"] = payload.identifier.trim();
    } else {
      body["phone"] = normalizePhone(payload.identifier.trim());
    }

    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Registration failed");
    }

    setUser(data.data.user);
    setToken(data.data.accessToken);
  };

  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    setToken(null);
  };

  const authFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });

    // Auto refresh if 401
    if (res.status === 401 && token) {
      try {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          setToken(refreshed.data.accessToken);
          setUser(refreshed.data.user);
          headers.set("Authorization", `Bearer ${refreshed.data.accessToken}`);
          return await fetch(url, {
            ...init,
            headers,
            credentials: "include",
          });
        }
      } catch {
        // Refresh failed
      }
      setUser(null);
      setToken(null);
    }

    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
