import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import type { TenantInfo } from "./CityPicker.js";
import { useTranslation } from "../utils/i18n.js";
import {
  Send,
  X,
  RotateCcw,
  Search,
  AlertTriangle,
  Clock,
  Phone,
  BarChart2,
  ExternalLink,
  Sparkles,
  Lightbulb,
  BookOpen,
  ShieldCheck,
} from "lucide-react";

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  time: string;
  action?:
    | {
        label: string;
        onClick: () => void;
      }
    | undefined;
  details?:
    | {
        title?: string;
        chips?: string[];
        link?: string;
      }
    | undefined;
}

export function CivicChatbot({ tenant }: { tenant: TenantInfo }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<boolean>(true);
  const { locale } = useTranslation();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const getGreeting = () => {
    if (locale === "hi") {
      return `नमस्ते! मैं सिविकपल्स सहायक (CivicPulse Sahayak) हूँ, ${tenant.name} का नागरिक शिकायत सहायक। मैं आपकी शिकायत ट्रैक करने, नई समस्या दर्ज करने या नगर निगम नियमों की जानकारी देने में मदद कर सकता हूँ।`;
    }
    if (locale === "pa") {
      return `ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਸਿਵਿਕਪਲਸ ਸਹਾਇਕ (CivicPulse Sahayak) ਹਾਂ, ${tenant.name} ਦਾ ਨਾਗਰਿਕ ਸਹਾਇਕ। ਮੈਂ ਸ਼ਿਕਾਇਤ ਟਰੈਕ ਕਰਨ ਜਾਂ ਨਵੀਂ ਰਿਪੋਰਟ ਦਰਜ ਕਰਨ ਵਿੱਚ ਤੁਹਾਡੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ।`;
    }
    return `Hello! I am CivicPulse Sahayak, the 24/7 civic redressal assistant for ${tenant.name}. How can I assist you with your city issues today?`;
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: getGreeting(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleReset = () => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        sender: "bot",
        text: getGreeting(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const processUserQuery = async (queryText: string) => {
    const q = queryText.trim().toLowerCase();
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Issue Tracking query (e.g. NVR-..., or track issue)
    const issueMatch = /NVR-[A-Z0-9]+-[0-9]+/i.exec(queryText);
    if (issueMatch) {
      const publicId = issueMatch[0].toUpperCase();
      setIsTyping(true);

      try {
        const res = await fetch(`/api/v1/issues/${encodeURIComponent(publicId)}`);
        if (res.ok) {
          const json = await res.json();
          const issue = json.data;
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              sender: "bot",
              text: `Found Issue #${publicId} in ${tenant.name}:\n• Status: ${issue.status?.toUpperCase()}\n• Category: ${issue.category?.names?.[locale] || issue.category?.code || "Civic Issue"}\n• Ward: ${issue.ward?.name || issue.location?.wardId || "Assigned"}\n• Priority Score: ${issue.priority?.breakdown?.score || issue.priority?.score || "Calculated"}`,
              time: nowTime,
              details: {
                title: issue.description,
                chips: [
                  `Status: ${issue.status}`,
                  `Priority: ${issue.priority?.breakdown?.score ?? 28}/100`,
                ],
              },
              action: {
                label: "View Issue Timeline",
                onClick: () => {
                  setIsOpen(false);
                  void navigate(`/issues/${publicId}`);
                },
              },
            },
          ]);
          return;
        }
      } catch {
        // continue to general fallback
      }

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `I searched for Issue ID "${publicId}". If this was filed recently, it is being processed by the municipal triage queue. You can check your personal submissions under "My Reports".`,
          time: nowTime,
          action: {
            label: "Open My Reports",
            onClick: () => {
              setIsOpen(false);
              void navigate("/my-reports");
            },
          },
        },
      ]);
      return;
    }

    // AI Mode: Call Gemini Civic AI for tips, awareness, and dynamic guidance
    if (
      aiMode ||
      q.includes("tip") ||
      q.includes("trick") ||
      q.includes("advice") ||
      q.includes("right") ||
      q.includes("law") ||
      q.includes("act") ||
      q.includes("rti") ||
      q.includes("aware") ||
      q.includes("swachh") ||
      q.includes("segregat") ||
      q.includes("plastic") ||
      q.includes("dlp") ||
      q.includes("guideline")
    ) {
      setIsTyping(true);
      try {
        const mode =
          q.includes("tip") || q.includes("trick")
            ? "tips"
            : q.includes("right") || q.includes("law") || q.includes("rti") || q.includes("aware")
              ? "awareness"
              : "general";

        const res = await fetch("/api/v1/public/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: queryText,
            tenantSlug: tenant.slug,
            mode,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const reply = json.data?.reply;
          if (reply) {
            setIsTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-${Date.now()}`,
                sender: "bot",
                text: reply,
                time: nowTime,
                details: {
                  chips: [
                    json.data?.source === "gemini"
                      ? "✨ Gemini Civic AI"
                      : "💡 Civic Knowledge Engine",
                    tenant.name,
                  ],
                },
              },
            ]);
            return;
          }
        }
      } catch {
        // Fallback to local rule matchers
      }
      setIsTyping(false);
    }

    // 2. Report Issue Guidance
    if (
      q.includes("report") ||
      q.includes("file") ||
      q.includes("complain") ||
      q.includes("submit") ||
      q.includes("शिकायत") ||
      q.includes("ਰਿਪੋਰਟ")
    ) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `You can report civic problems in 3 simple steps:\n1. Open the interactive map & tap the exact problem location.\n2. Upload a photo (GPS coordinates & blur are checked automatically).\n3. Confirm category & submit. The system scores priority deterministically without human bias!`,
          time: nowTime,
          action: {
            label: "Start Report Now",
            onClick: () => {
              setIsOpen(false);
              void navigate("/");
            },
          },
        },
      ]);
      return;
    }

    // 3. Category SLAs & Policies
    if (
      q.includes("sla") ||
      q.includes("time") ||
      q.includes("deadline") ||
      q.includes("how long") ||
      q.includes("समय") ||
      q.includes("ਸਮਾਂ")
    ) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `Official Redressal SLAs for ${tenant.name}:\n• 🕳️ Potholes & Road Cuts: 48 Hours\n• 🗑️ Garbage Dumps: 24 Hours\n• 💡 Streetlights: 72 Hours\n• 🚰 Water Pipeline Leaks: 24 Hours\n• 🌊 Drainage Overflows: 48 Hours\n\nIf unaddressed at 50% or 100% SLA time, the ticket auto-escalates to the Department Head!`,
          time: nowTime,
        },
      ]);
      return;
    }

    // 4. City Performance & Dashboard
    if (
      q.includes("performance") ||
      q.includes("dashboard") ||
      q.includes("metric") ||
      q.includes("stats") ||
      q.includes("ward") ||
      q.includes("प्रगति")
    ) {
      setIsTyping(true);
      try {
        const res = await fetch(`/api/v1/public/${tenant.slug}/metrics`);
        if (res.ok) {
          const json = await res.json();
          const overall = json.data?.overall;
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              sender: "bot",
              text: `📊 ${tenant.name} Performance Snapshot:\n• Total Issues Tracked: ${overall?.total_issues ?? "100+"}\n• Open Work Orders: ${overall?.open_count ?? "35"}\n• Median Resolution Time: ${overall?.median_resolution_hours ?? "28"} Hours\n• SLA Compliance: ${overall?.sla_compliance_pct ?? "86"}%`,
              time: nowTime,
              action: {
                label: "View Full Transparency Dashboard",
                onClick: () => {
                  setIsOpen(false);
                  void navigate("/dashboard");
                },
              },
            },
          ]);
          return;
        }
      } catch {
        // fallback
      }

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `You can monitor city-wide resolution statistics, ward-by-ward compliance, and response times on the public transparency dashboard.`,
          time: nowTime,
          action: {
            label: "Open Dashboard",
            onClick: () => {
              setIsOpen(false);
              void navigate("/dashboard");
            },
          },
        },
      ]);
      return;
    }

    // 5. Emergency Helplines
    if (
      q.includes("help") ||
      q.includes("phone") ||
      q.includes("contact") ||
      q.includes("number") ||
      q.includes("emergency") ||
      q.includes("हेल्पलाइन") ||
      q.includes("ਫੋਨ")
    ) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `🚨 Essential Emergency & Municipal Contacts:\n• Municipal Grievance Helpline: 1916\n• Police Control Room: 112\n• Fire Emergency: 101\n• Ambulance Service: 108\n• Water & Sewage Emergency: 1800-180-2022\n\nOffice Hours: Monday to Saturday, 9:00 AM – 5:00 PM.`,
          time: nowTime,
        },
      ]);
      return;
    }

    // 6. Specific Problem Queries (Pothole, garbage, streetlight, etc.)
    if (q.includes("pothole") || q.includes("road") || q.includes("गड्ढा") || q.includes("ਟੋਆ")) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `Road and pothole repairs in ${tenant.name} are managed by Roads & Infrastructure. Standard resolution SLA is 48 hours. Photo proof is mandatory for resolution closure.`,
          time: nowTime,
          action: {
            label: "Report a Road Issue",
            onClick: () => {
              setIsOpen(false);
              void navigate("/");
            },
          },
        },
      ]);
      return;
    }

    if (q.includes("garbage") || q.includes("waste") || q.includes("कचरा") || q.includes("ਕੂੜਾ")) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `Garbage dump reports are assigned to Solid Waste & Sanitation with a strict 24-hour SLA. Upvoting an existing report (+1) raises its priority without creating duplicate tickets!`,
          time: nowTime,
          action: {
            label: "Report Garbage Dump",
            onClick: () => {
              setIsOpen(false);
              void navigate("/");
            },
          },
        },
      ]);
      return;
    }

    // Default polite conversational reply
    setMessages((prev) => [
      ...prev,
      {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `I can assist you with tracking ticket IDs (e.g. NVR-...), filing potholes, garbage, streetlights, checking ward performance, or viewing municipal contacts in ${tenant.name}. How can I help?`,
        time: nowTime,
      },
    ]);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    setInput("");

    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text: userText,
        time: nowTime,
      },
    ]);

    void processUserQuery(userText);
  };

  const handleQuickAction = (actionText: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text: actionText,
        time: nowTime,
      },
    ]);
    void processUserQuery(actionText);
  };

  return (
    <>
      {/* ── Doodle "N" Floating Action Button ─────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close Civic Assistant" : "Open Civic Assistant"}
          title={isOpen ? "Close Chat" : "CivicPulse Sahayak (Civic Assistant)"}
          style={{
            width: "58px",
            height: "58px",
            borderRadius: "50%",
            backgroundColor: isOpen ? "var(--asphalt-900)" : "var(--paint-400)",
            color: isOpen ? "#ffffff" : "var(--asphalt-950)",
            border: "3px solid var(--asphalt-900)",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition:
              "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = isOpen
              ? "rotate(90deg) scale(1.06)"
              : "scale(1.08) rotate(-4deg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = isOpen ? "rotate(90deg)" : "rotate(0deg)";
          }}
        >
          {isOpen ? (
            <X size={26} strokeWidth={2.5} />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {/* Hand-drawn / Doodle "N" Stencil Glyph */}
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                {/* Doodle hand-drawn circle halo */}
                <path
                  d="M16 2.5C8.5 2.5 3 8 3 15.5C3 23 8.5 28.5 16 28.5C23.5 28.5 29 23 29 15.5C29 8 23.5 2.5 16 2.5"
                  stroke="#171b1a"
                  strokeWidth="1.2"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                {/* Bold Doodle N character with street-stencil cuts */}
                <path
                  d="M9 22V10L23 22V10"
                  stroke="#171b1a"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Green online pulse badge */}
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "10px",
                  height: "10px",
                  backgroundColor: "var(--sign-500)",
                  border: "2px solid #ffffff",
                  borderRadius: "50%",
                }}
              />
            </div>
          )}
        </button>
      </div>

      {/* ── Chatbot Popover Window ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          role="region"
          aria-label="Civic Assistant Chatbot"
          style={{
            position: "fixed",
            bottom: "94px",
            right: "24px",
            width: "380px",
            maxWidth: "calc(100vw - 36px)",
            height: "530px",
            maxHeight: "calc(100dvh - 114px)",
            backgroundColor: "var(--surface)",
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 1000,
            animation: "chatbotPop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              backgroundColor: "var(--asphalt-900)",
              color: "#ffffff",
              padding: "0.875rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "2px solid var(--paint-400)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  backgroundColor: "var(--paint-400)",
                  color: "var(--asphalt-950)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "14px",
                  fontFamily: "var(--font-display)",
                }}
              >
                N
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <span
                    style={{ fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}
                  >
                    CivicPulse Sahayak
                  </span>
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      backgroundColor: "var(--sign-300)",
                      borderRadius: "50%",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--asphalt-300)" }}>
                  {tenant.name} • 24/7 Redressal
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <button
                type="button"
                onClick={handleReset}
                title="Restart chat"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--asphalt-300)",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "4px",
                  display: "flex",
                }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--asphalt-300)",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "4px",
                  display: "flex",
                }}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* AI Mode Toggle Bar */}
          <div
            style={{
              padding: "0.4rem 0.875rem",
              backgroundColor: aiMode ? "rgba(245, 158, 11, 0.12)" : "var(--surface-sunken)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Sparkles size={13} color={aiMode ? "#f59e0b" : "var(--text-muted)"} />
              <span
                style={{ fontWeight: 600, color: aiMode ? "var(--text)" : "var(--text-muted)" }}
              >
                {aiMode ? "Gemini Civic AI Active" : "Standard Rule Bot"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAiMode(!aiMode)}
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                backgroundColor: aiMode ? "var(--paint-400)" : "var(--surface)",
                color: aiMode ? "var(--asphalt-950)" : "var(--text)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {aiMode ? "✨ AI: ON" : "AI: OFF"}
            </button>
          </div>

          {/* Messages Feed */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.875rem",
              backgroundColor: "var(--bg)",
            }}
          >
            {messages.map((m) => {
              const isBot = m.sender === "bot";
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isBot ? "flex-start" : "flex-end",
                    gap: "0.25rem",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "88%",
                      padding: "0.6875rem 0.875rem",
                      borderRadius: isBot ? "14px 14px 14px 2px" : "14px 14px 2px 14px",
                      backgroundColor: isBot ? "var(--surface)" : "var(--asphalt-900)",
                      color: isBot ? "var(--text)" : "#ffffff",
                      border: `1px solid ${isBot ? "var(--border)" : "transparent"}`,
                      fontSize: "0.875rem",
                      lineHeight: 1.45,
                      whiteSpace: "pre-line",
                      wordBreak: "break-word",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                  >
                    {m.text}

                    {m.details?.chips && (
                      <div
                        style={{
                          display: "flex",
                          gap: "0.375rem",
                          marginTop: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {m.details.chips.map((chip, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "var(--surface-sunken)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}

                    {m.action && (
                      <div style={{ marginTop: "0.625rem" }}>
                        <button
                          type="button"
                          onClick={m.action.onClick}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            backgroundColor: "var(--paint-400)",
                            color: "var(--asphalt-950)",
                            border: "1px solid var(--paint-500)",
                            borderRadius: "var(--r-sm)",
                            padding: "0.375rem 0.625rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <span>{m.action.label}</span>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <span
                    style={{ fontSize: "0.6875rem", color: "var(--text-subtle)", padding: "0 4px" }}
                  >
                    {m.time}
                  </span>
                </div>
              );
            })}

            {isTyping && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "var(--surface)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  width: "fit-content",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: "var(--text-muted)",
                    borderRadius: "50%",
                    animation: "pulse 1s infinite alternate",
                  }}
                />
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: "var(--text-muted)",
                    borderRadius: "50%",
                    animation: "pulse 1s infinite alternate 0.2s",
                  }}
                />
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: "var(--text-muted)",
                    borderRadius: "50%",
                    animation: "pulse 1s infinite alternate 0.4s",
                  }}
                />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          <div
            style={{
              padding: "0.5rem 0.75rem",
              backgroundColor: "var(--surface)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "0.375rem",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {aiMode ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAction("Give me top tips for high-impact civic reporting")
                  }
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Lightbulb size={11} color="#f59e0b" />
                  <span>💡 Reporting Tips</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAction("What are my civic rights under the 74th Amendment and RTI?")
                  }
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <BookOpen size={11} color="#f59e0b" />
                  <span>📜 Citizen Rights</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAction("What are the 3-way waste segregation rules under SWM 2016?")
                  }
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <ShieldCheck size={11} color="#f59e0b" />
                  <span>♻️ Waste Protocols</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickAction(
                      "What are the road repair standards and contractor DLP warranties?"
                    )
                  }
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <AlertTriangle size={11} color="#f59e0b" />
                  <span>🚸 Road Standards</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAction("Track my issue status")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Search size={11} />
                  <span>Track Issue</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleQuickAction("Track my issue status")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Search size={11} />
                  <span>Track Issue</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAction("How do I report a pothole?")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <AlertTriangle size={11} />
                  <span>Report Pothole</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAction("What are category SLA deadlines?")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Clock size={11} />
                  <span>SLA Hours</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAction("Show city performance dashboard stats")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <BarChart2 size={11} />
                  <span>Performance</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAction("Municipal emergency helplines")}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    backgroundColor: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Phone size={11} />
                  <span>Helplines</span>
                </button>
              </>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSend}
            style={{
              padding: "0.625rem 0.75rem",
              backgroundColor: "var(--surface)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or enter issue ID..."
              style={{
                flex: 1,
                height: "38px",
                padding: "0 0.75rem",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border-control)",
                backgroundColor: "var(--surface)",
                color: "var(--text)",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "var(--r-sm)",
                backgroundColor: input.trim() ? "var(--paint-400)" : "var(--surface-sunken)",
                color: input.trim() ? "var(--asphalt-950)" : "var(--text-subtle)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() ? "pointer" : "default",
                transition: "all 0.15s ease",
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
