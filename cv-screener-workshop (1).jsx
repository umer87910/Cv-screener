import { useState } from "react";

const NAV_SECTIONS = [
  { id: "brief", label: "01 Project Brief", icon: "📋" },
  { id: "architecture", label: "02 Architecture", icon: "🏗️" },
  { id: "setup", label: "03 Pre-Build Setup", icon: "⚙️" },
  { id: "build", label: "04 Build Guide", icon: "🔨" },
  { id: "testing", label: "05 Testing Guide", icon: "🧪" },
  { id: "challenges", label: "06 Challenges", icon: "🎯" },
  { id: "concepts", label: "07 Concepts", icon: "💡" },
  { id: "reference", label: "08 Quick Reference", icon: "📌" },
];

const BUILD_STEPS = [
  {
    num: 1,
    title: "Google Sheets Trigger",
    desc: "Detect new form submission row every 60 seconds",
    color: "#4ade80",
    details: {
      credential: "Google OAuth credential",
      event: "Row Added",
      document: "Paste URL of linked Google Sheet",
      sheet: "Form Responses 1",
      poll: "Every 1 minute",
      note: "Why Google Sheets and not Google Forms trigger? When a form is submitted, it appends a row to its linked Sheet. n8n's trigger fires on new rows — most reliable approach without needing a public webhook URL.",
    },
  },
  {
    num: 2,
    title: "HTTP Request — Fetch CV from Drive",
    desc: "Fetch binary CV file from Google Drive",
    color: "#60a5fa",
    details: {
      method: "GET",
      url: "{{ 'https://www.googleapis.com/drive/v3/files/' + $json['Upload your CV'].split('id=')[1] + '?alt=media' }}",
      auth: "Predefined Credential Type → Google Drive OAuth2",
      responseFormat: "File",
      outputField: "cv_binary",
    },
  },
  {
    num: 3,
    title: "Code Node — Extract & Prepare CV",
    desc: "Convert binary to base64, organize form fields",
    color: "#f59e0b",
    details: {
      language: "JavaScript",
      mode: "Run Once for All Items",
      code: `const binaryData = $input.first().binary?.cv_binary;
if (!binaryData) { throw new Error('No CV file found'); }
const base64 = binaryData.data;
const mimeType = binaryData.mimeType || 'application/pdf';
const formData = $input.first().json;
return [{
  json: {
    cv_base64: base64,
    cv_mime_type: mimeType,
    applicant_name: formData['Full Name'],
    applicant_email: formData['Email Address'],
    role: formData['Role Applying For'],
    experience_years: formData['Years of Experience'],
    submitted_at: formData['Timestamp'],
  }
}];`,
    },
  },
  {
    num: 4,
    title: "HTTP Request — Gemini AI Screening",
    desc: "Send CV + scoring prompt, receive JSON score",
    color: "#a78bfa",
    details: {
      method: "POST",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      header1: "x-goog-api-key: YOUR_GEMINI_API_KEY",
      header2: "Content-Type: application/json",
      prompt: `{
  "contents": [{
    "parts": [
      {
        "inline_data": {
          "mime_type": "={{ $json.cv_mime_type }}",
          "data": "={{ $json.cv_base64 }}"
        }
      },
      {
        "text": "You are a senior recruiter screening CVs for a {{ $json.role }} role. Candidate has {{ $json.experience_years }} years of experience. Respond ONLY with valid JSON, no markdown. Keys: score (int 1-10), strengths (string 2-3 sentences), gaps (string 2-3 sentences), recommendation (exactly: Strong Yes, Yes, or No)."
      }
    ]
  }]
}`,
    },
  },
  {
    num: 5,
    title: "Code Node — Parse Gemini Response",
    desc: "Extract and parse nested JSON from Gemini",
    color: "#f97316",
    details: {
      code: `const geminiResponse = $input.first().json;
const rawText = geminiResponse.candidates[0].content.parts[0].text;
const cleaned = rawText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
let screening;
try {
  screening = JSON.parse(cleaned);
} catch (e) {
  throw new Error('Gemini returned invalid JSON: ' + rawText);
}
const prev = $('Code').first().json;
return [{
  json: {
    ...prev,
    ai_score: screening.score,
    ai_strengths: screening.strengths,
    ai_gaps: screening.gaps,
    ai_recommendation: screening.recommendation,
  }
}];`,
    },
  },
  {
    num: 6,
    title: "HTTP Request — Create Notion Page",
    desc: "Create structured candidate card in Notion database",
    color: "#ec4899",
    details: {
      method: "POST",
      url: "https://api.notion.com/v1/pages",
      headers: "Authorization: Bearer YOUR_NOTION_TOKEN\nContent-Type: application/json\nNotion-Version: 2022-06-28",
      body: `{
  "parent": { "database_id": "YOUR_NOTION_DATABASE_ID" },
  "properties": {
    "Name": { "title": [{ "text": { "content": "={{ $json.applicant_name }}" } }] },
    "Email": { "email": "={{ $json.applicant_email }}" },
    "Role": { "select": { "name": "={{ $json.role }}" } },
    "AI Score": { "number": {{ $json.ai_score }} },
    "Strengths": { "rich_text": [{ "text": { "content": "={{ $json.ai_strengths }}" } }] },
    "Gaps": { "rich_text": [{ "text": { "content": "={{ $json.ai_gaps }}" } }] },
    "Recommendation": { "select": { "name": "={{ $json.ai_recommendation }}" } },
    "Applied At": { "date": { "start": "={{ $json.submitted_at }}" } },
    "Status": { "select": { "name": "To Review" } }
  }
}`,
    },
  },
  {
    num: 7,
    title: "IF Node — Score Threshold Check",
    desc: "Route: score ≥ 7 → WhatsApp alert, else → end",
    color: "#14b8a6",
    details: {
      condition: "Number",
      value1: "={{ $json.ai_score }}",
      operation: "Larger or Equal",
      value2: "7",
      true: "WhatsApp alert to hiring manager",
      false: "Workflow ends — candidate logged in Notion only",
    },
  },
  {
    num: 8,
    title: "HTTP Request — WhatsApp Alert",
    desc: "Send hiring manager alert for strong candidates",
    color: "#ef4444",
    details: {
      method: "POST",
      url: "https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/messages",
      auth: "Bearer YOUR_WHATSAPP_TOKEN",
      body: `{
  "messaging_product": "whatsapp",
  "to": "HIRING_MANAGER_NUMBER",
  "type": "text",
  "text": {
    "body": "Strong candidate!\\nName: {{ $json.applicant_name }}\\nRole: {{ $json.role }}\\nScore: {{ $json.ai_score }}/10\\nRecommendation: {{ $json.ai_recommendation }}\\n\\nStrengths: {{ $json.ai_strengths }}\\n\\nView in Notion: {{ $('HTTP Request3').item.json.url }}"
  }
}`,
    },
  },
];

const ERRORS = [
  { error: "Gemini returns prose not JSON", cause: "Prompt not strict enough", fix: "Append: 'Your response must start with { and end with }. No other text.'" },
  { error: "JSON.parse error in Code node", cause: "Gemini wrapped JSON in ```json markdown fences", fix: "The .replace() cleanup handles this — verify both replace() calls are present" },
  { error: "Notion 404: database not found", cause: "Database ID wrong or integration not shared", fix: "Share Notion database with your integration. Re-copy ID from the URL." },
  { error: "Notion 400: property type mismatch", cause: "Column type doesn't match JSON property structure", fix: "Check AI Score is type Number and Recommendation is type Select in Notion" },
  { error: "Google Sheets: no data", cause: "Form not linked to Sheets or wrong sheet name", fix: "In Google Forms: Responses tab > Sheets icon to link. Default: Form Responses 1" },
  { error: "Trigger not firing", cause: "OAuth not connected or poll not started", fix: "Click 'Fetch Test Event' in trigger. Re-authenticate Google OAuth if needed." },
  { error: "WhatsApp 401", cause: "Token expired (temporary tokens last 24 hours)", fix: "Generate a permanent system user token in Meta Business Manager" },
];

const CHALLENGES = [
  {
    level: "Easy",
    time: "15–20 min",
    color: "#4ade80",
    bg: "rgba(74,222,128,0.08)",
    tasks: [
      { title: "Change score threshold", desc: "Current threshold is 7. Change it to 8. Test with a CV that scores between 7 and 8 to verify branching." },
      { title: "Add applicant confirmation email", desc: "After Notion node, add SMTP/Gmail node that sends a confirmation to applicant's email ($json.applicant_email)." },
      { title: "Update status for low scorers", desc: "For FALSE branch, PATCH the Notion page to update Status from 'To Review' to 'Rejected'." },
    ],
  },
  {
    level: "Medium",
    time: "30–40 min",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    tasks: [
      { title: "Build weekly digest", desc: "Second workflow with weekly cron trigger. Query Notion database for past 7 days' candidates. Send summary to hiring manager every Monday." },
      { title: "Support second role", desc: "Add IF node to check 'Role Applying For' field. Route to different Gemini prompts for developer vs. marketing roles." },
    ],
  },
  {
    level: "Hard",
    time: "45+ min",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    tasks: [
      { title: "Deploy on real job listing", desc: "Create actual job listing for a real business. Process 3+ real applications. Screenshot Notion board. Write 150-word LinkedIn post." },
      { title: "What-if: 500 applications/day", desc: "Gemini free tier = 60 req/min. If 500 CVs arrive in 1 hour, what breaks? Write architecture note: batching, queuing, model downgrade." },
    ],
  },
];

const NOTION_TYPES = [
  { type: "Title", json: '{ "title": [{ "text": { "content": "..." } }] }', use: "Candidate name" },
  { type: "Rich Text", json: '{ "rich_text": [{ "text": { "content": "..." } }] }', use: "Strengths, Gaps" },
  { type: "Number", json: '{ "number": 7 }', use: "AI Score" },
  { type: "Email", json: '{ "email": "a@b.com" }', use: "Applicant email" },
  { type: "Select", json: '{ "select": { "name": "Yes" } }', use: "Recommendation, Status" },
  { type: "Date", json: '{ "date": { "start": "2024-01-01T00:00:00Z" } }', use: "Applied At" },
];

// ─── Components ─────────────────────────────────────────────────────────────

function Badge({ children, color = "#60a5fa" }) {
  return (
    <span style={{
      background: color + "22",
      color: color,
      border: `1px solid ${color}44`,
      borderRadius: 6,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 1,
      fontFamily: "monospace",
    }}>{children}</span>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ position: "relative", margin: "12px 0" }}>
      <pre style={{
        background: "#0d1117",
        border: "1px solid #30363d",
        borderRadius: 10,
        padding: "16px 18px",
        fontSize: 12.5,
        color: "#e6edf3",
        overflowX: "auto",
        lineHeight: 1.7,
        margin: 0,
        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
      }}>{code}</pre>
      <button onClick={copy} style={{
        position: "absolute", top: 10, right: 10,
        background: copied ? "#4ade8022" : "#21262d",
        border: `1px solid ${copied ? "#4ade80" : "#30363d"}`,
        borderRadius: 6,
        color: copied ? "#4ade80" : "#8b949e",
        padding: "3px 10px",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "monospace",
        transition: "all 0.2s",
      }}>{copied ? "✓ Copied" : "Copy"}</button>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#161b22",
      border: "1px solid #30363d",
      borderRadius: 14,
      padding: "20px 24px",
      marginBottom: 16,
      ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: 26,
      fontWeight: 800,
      color: "#e6edf3",
      margin: "0 0 20px",
      borderBottom: "2px solid #30363d",
      paddingBottom: 12,
    }}>{children}</h2>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function BriefSection() {
  return (
    <div>
      <SectionTitle>Project Brief</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[["75 min", "Build Time"], ["5–6", "n8n Nodes"], ["100%", "Free Tools"], ["Level 1", "Complexity"]].map(([v, l]) => (
          <Card key={l} style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#60a5fa", fontFamily: "monospace" }}>{v}</div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{l}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h3 style={{ color: "#ef4444", fontFamily: "'Playfair Display', serif", fontSize: 18, margin: "0 0 10px" }}>🔥 The Problem</h3>
        <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: 0 }}>
          Founders post job listings and get flooded with CVs. Most are irrelevant. Reading each one wastes <strong style={{ color: "#f59e0b" }}>2–4 hours per role</strong>. Shortlists live in WhatsApp messages and PDF folders. Qualified candidates get missed. The hiring decision often goes to whoever was reviewed <em>last</em>, not whoever is most qualified.
        </p>
      </Card>

      <Card>
        <h3 style={{ color: "#4ade80", fontFamily: "'Playfair Display', serif", fontSize: 18, margin: "0 0 10px" }}>🎯 Target User</h3>
        <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: 0 }}>
          Startups, small agencies, and growing businesses hiring 1–5 roles per quarter <strong>without a dedicated HR team</strong>. Typical profile: founder or office manager reviewing 20–80 CVs per role, spending 2–4 hours on first-round screening that should take 20 minutes.
        </p>
      </Card>

      <Card>
        <h3 style={{ color: "#a78bfa", fontFamily: "'Playfair Display', serif", fontSize: 18, margin: "0 0 14px" }}>📦 What This Project Builds</h3>
        <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: "0 0 14px" }}>
          Applicant fills Google Form → n8n picks up response → extracts CV text → sends to Gemini AI with scoring prompt → returns fit score (1–10) and plain-English summary → creates Notion card → if score ≥ 7, hiring manager gets WhatsApp alert.
        </p>
      </Card>

      <Card>
        <h3 style={{ color: "#60a5fa", fontFamily: "'Playfair Display', serif", fontSize: 18, margin: "0 0 14px" }}>🛠 Full Tech Stack</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d" }}>
              {["Tool", "Role", "Cost"].map(h => <th key={h} style={{ textAlign: "left", color: "#8b949e", padding: "6px 10px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ["n8n", "Workflow engine — orchestrates every step", "Free (local)"],
              ["Google Forms", "Applicant intake — collects name, email, CV file", "Free"],
              ["Google Drive", "Stores uploaded CV files from form submissions", "Free (15 GB)"],
              ["Gemini 2.0 Flash", "AI screening — scores CV and writes summary", "1M tokens/day free"],
              ["Notion API", "Creates structured candidate cards", "Free personal plan"],
              ["WhatsApp Cloud API", "Alerts hiring manager for high-scoring candidates", "1,000 msgs/month free"],
            ].map(([t, r, c]) => (
              <tr key={t} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={{ padding: "8px 10px", color: "#60a5fa", fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{t}</td>
                <td style={{ padding: "8px 10px", color: "#c9d1d9" }}>{r}</td>
                <td style={{ padding: "8px 10px" }}><Badge color="#4ade80">{c}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ background: "rgba(167,139,250,0.06)", borderColor: "#a78bfa44" }}>
        <h3 style={{ color: "#a78bfa", fontSize: 16, margin: "0 0 8px" }}>💰 Market Relevance</h3>
        <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: 0, fontSize: 14 }}>
          Every major ATS — Greenhouse, Lever, Workday — has an AI screening layer. These cost <strong style={{ color: "#ef4444" }}>$500–$3,000/month</strong>. Automation consultants can offer this as a productised service for <strong style={{ color: "#4ade80" }}>PKR 20,000–50,000 per setup</strong>.
        </p>
      </Card>
    </div>
  );
}

function ArchitectureSection() {
  return (
    <div>
      <SectionTitle>Architecture Diagram</SectionTitle>

      <Card style={{ background: "#0d1117" }}>
        <h3 style={{ color: "#60a5fa", fontSize: 15, margin: "0 0 16px", fontFamily: "monospace" }}>MAIN FLOW</h3>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          {[
            { label: "Google Sheets\nTrigger", color: "#4ade80" },
            { label: "Drive:\nGet File", color: "#60a5fa" },
            { label: "Code:\nExtract Text", color: "#f59e0b" },
            { label: "Gemini\nAI", color: "#a78bfa" },
            { label: "Code:\nParse JSON", color: "#f97316" },
            { label: "Notion:\nCreate Page", color: "#ec4899" },
            { label: "IF:\nScore ≥ 7?", color: "#14b8a6" },
          ].map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                background: n.color + "18",
                border: `1.5px solid ${n.color}66`,
                borderRadius: 10,
                padding: "10px 14px",
                textAlign: "center",
                fontSize: 12,
                color: n.color,
                fontWeight: 700,
                fontFamily: "monospace",
                whiteSpace: "pre-line",
                minWidth: 80,
              }}>{n.label}</div>
              {i < 6 && <span style={{ color: "#4b5563", fontSize: 18 }}>→</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#4ade8011", border: "1px solid #4ade8033", borderRadius: 8, padding: 12 }}>
            <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>✅ TRUE BRANCH (score ≥ 7)</div>
            <div style={{ color: "#8b949e", fontSize: 13, marginTop: 4 }}>WhatsApp alert sent to hiring manager with score, summary & Notion link</div>
          </div>
          <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: 12 }}>
            <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>❌ FALSE BRANCH (score &lt; 7)</div>
            <div style={{ color: "#8b949e", fontSize: 13, marginTop: 4 }}>Workflow ends — candidate still logged in Notion</div>
          </div>
        </div>
      </Card>

      <SectionTitle>Data Flow — What Goes In & Out at Each Node</SectionTitle>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d" }}>
              {["Node", "Goes IN", "Comes OUT"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#8b949e", padding: "8px 10px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Google Sheets Trigger", "Form submission event fires", "JSON: name, email, role, file upload URL"],
              ["HTTP Request (Drive)", "File URL from form upload", "Raw binary file content (PDF/DOCX)"],
              ["Code node (extract)", "Binary CV file data", "Base64 string + clean JSON of form fields"],
              ["HTTP Request (Gemini)", "System prompt + CV as base64", "JSON: score, strengths, gaps, recommendation"],
              ["Code node (parse)", "Raw Gemini text response", "Parsed ai_score, ai_strengths, ai_gaps"],
              ["HTTP Request (Notion)", "Candidate name, email, score, AI summary", "Notion page ID and URL"],
              ["IF node", "Score number from Gemini", "True → WhatsApp; False → end"],
              ["HTTP Request (WhatsApp)", "Manager phone, candidate info, Notion URL", "HTTP 200 — message delivered"],
            ].map(([n, i, o]) => (
              <tr key={n} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={{ padding: "8px 10px", color: "#60a5fa", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{n}</td>
                <td style={{ padding: "8px 10px", color: "#8b949e", fontSize: 12 }}>{i}</td>
                <td style={{ padding: "8px 10px", color: "#c9d1d9", fontSize: 12 }}>{o}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ background: "rgba(239,68,68,0.06)", borderColor: "#ef444444" }}>
        <h3 style={{ color: "#ef4444", fontSize: 15, margin: "0 0 8px" }}>⚠️ Critical Branching Note</h3>
        <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: 0, fontSize: 14 }}>
          The IF node branches on the score number returned by Gemini. The Gemini prompt <strong>must</strong> instruct the model to return ONLY a JSON object — not prose, not markdown, not an explanation. If the output format is wrong, the score extraction fails. <strong style={{ color: "#ef4444" }}>This is the most common point of failure.</strong>
        </p>
      </Card>
    </div>
  );
}

function SetupSection() {
  const [openStep, setOpenStep] = useState(null);
  const steps = [
    {
      num: 1, title: "Create the Google Form",
      content: (
        <ul style={{ color: "#c9d1d9", lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          <li>Go to <strong style={{ color: "#60a5fa" }}>forms.google.com</strong> → New blank form</li>
          <li>Title: <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#f59e0b" }}>Job Application — [Role Name]</code></li>
          <li>Fields: Full Name, Email Address, Role Applying For, Years of Experience</li>
          <li>File upload: <strong>Upload Your CV</strong> (required) — allow PDF and DOCX only</li>
          <li>Settings → Responses → check <em>Collect email addresses</em></li>
          <li>Responses tab → Sheets icon → create linked Google Sheet</li>
        </ul>
      )
    },
    {
      num: 2, title: "Set Up Google OAuth for n8n",
      warning: "This is the trickiest setup step — walk through it slowly.",
      content: (
        <ul style={{ color: "#c9d1d9", lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          <li>Go to <strong style={{ color: "#60a5fa" }}>console.cloud.google.com</strong> → New project: <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#f59e0b" }}>n8n-workshop</code></li>
          <li>Enable APIs: Google Drive API, Google Sheets API</li>
          <li>APIs & Services → Credentials → OAuth 2.0 Client ID</li>
          <li>Application type: <strong>Web application</strong></li>
          <li>Redirect URI: <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#4ade80", fontSize: 11 }}>http://localhost:5678/rest/oauth2-credential/callback</code></li>
          <li>Download JSON → copy Client ID and Client Secret</li>
          <li>n8n: Settings → Credentials → New → Google Drive OAuth2 → paste → Connect</li>
        </ul>
      )
    },
    {
      num: 3, title: "Gemini API Key",
      content: (
        <div>
          <ul style={{ color: "#c9d1d9", lineHeight: 2, paddingLeft: 20, margin: "0 0 12px" }}>
            <li>Go to <strong style={{ color: "#60a5fa" }}>aistudio.google.com</strong></li>
            <li>Click Get API Key → Create API Key in new project</li>
            <li>Copy the key — starts with <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#f59e0b" }}>AIza</code></li>
            <li>Free tier: <strong style={{ color: "#4ade80" }}>1M tokens/day, 60 req/min</strong></li>
          </ul>
          <p style={{ color: "#8b949e", fontSize: 13, margin: "0 0 6px" }}>Test with curl before session:</p>
          <CodeBlock code={`curl -X POST \\
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{"contents":[{"parts":[{"text":"Reply with just the word: working"}]}]}'`} />
        </div>
      )
    },
    {
      num: 4, title: "Create the Notion Database",
      content: (
        <div>
          <p style={{ color: "#c9d1d9", margin: "0 0 12px" }}>Open Notion → New page: <strong style={{ color: "#a78bfa" }}>Talent Board — Workshop 2.0</strong> → Add full-page database</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #30363d" }}>
                {["Property Name", "Type", "Purpose"].map(h => <th key={h} style={{ textAlign: "left", color: "#8b949e", padding: "6px 8px" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ["Name", "Title", "Candidate full name"],
                ["Email", "Email", "Applicant email address"],
                ["Role", "Select", "Job role applied for"],
                ["AI Score", "Number", "Gemini fit score 1–10"],
                ["Strengths", "Text", "AI-generated strengths"],
                ["Gaps", "Text", "AI-generated gaps"],
                ["Recommendation", "Select", "Strong Yes / Yes / No"],
                ["Applied At", "Date", "Timestamp from form"],
                ["Status", "Select", "To Review / Shortlisted / Rejected / Hired"],
              ].map(([p, t, d]) => (
                <tr key={p} style={{ borderBottom: "1px solid #21262d" }}>
                  <td style={{ padding: "6px 8px", color: "#60a5fa", fontFamily: "monospace", fontWeight: 700 }}>{p}</td>
                  <td style={{ padding: "6px 8px" }}><Badge color="#a78bfa">{t}</Badge></td>
                  <td style={{ padding: "6px 8px", color: "#8b949e" }}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    },
    {
      num: 5, title: "Get Notion Integration Token & Database ID",
      content: (
        <ul style={{ color: "#c9d1d9", lineHeight: 2, paddingLeft: 20, margin: 0 }}>
          <li>Go to <strong style={{ color: "#60a5fa" }}>notion.so/my-integrations</strong> → New integration → <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#f59e0b" }}>n8n-workshop</code></li>
          <li>Copy Internal Integration Token (starts with <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#4ade80" }}>ntn_</code> or <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#4ade80" }}>secret_</code>)</li>
          <li>Talent Board database → Share → Invite → select n8n-workshop integration</li>
          <li>Copy Database ID from URL: <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4, color: "#a78bfa", fontSize: 11 }}>notion.so/[workspace]/DATABASE_ID?v=...</code></li>
        </ul>
      )
    },
  ];

  return (
    <div>
      <SectionTitle>Pre-Build Setup</SectionTitle>
      <Card style={{ background: "rgba(239,68,68,0.06)", borderColor: "#ef444444", marginBottom: 20 }}>
        <p style={{ color: "#ef4444", margin: 0, fontWeight: 700 }}>⚡ Complete every step BEFORE the build starts — saves 30 min of live troubleshooting. Send this checklist 48 hours before the session.</p>
      </Card>

      {steps.map(step => (
        <Card key={step.num} style={{ cursor: "pointer", padding: 0, overflow: "hidden" }}>
          <div
            onClick={() => setOpenStep(openStep === step.num ? null : step.num)}
            style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "16px 24px",
              background: openStep === step.num ? "#1c2128" : "transparent",
              transition: "background 0.2s",
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#60a5fa22", border: "2px solid #60a5fa66",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#60a5fa", fontWeight: 900, fontSize: 15, fontFamily: "monospace",
              flexShrink: 0,
            }}>{step.num}</div>
            <div style={{ flex: 1, color: "#e6edf3", fontWeight: 700, fontSize: 15 }}>{step.title}</div>
            <div style={{ color: "#4b5563", fontSize: 18, transition: "transform 0.2s", transform: openStep === step.num ? "rotate(90deg)" : "none" }}>›</div>
          </div>
          {openStep === step.num && (
            <div style={{ padding: "0 24px 20px" }}>
              {step.warning && (
                <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid #f59e0b44", borderRadius: 8, padding: "8px 14px", marginBottom: 14, color: "#f59e0b", fontSize: 13 }}>
                  ⚠️ {step.warning}
                </div>
              )}
              {step.content}
            </div>
          )}
        </Card>
      ))}

      <SectionTitle>Credentials Reference Table</SectionTitle>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d" }}>
              {["Credential", "Your Value", "Where it goes in n8n"].map(h => <th key={h} style={{ textAlign: "left", color: "#8b949e", padding: "8px 10px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ["Google OAuth Client ID", "Google Drive credential"],
              ["Google OAuth Client Secret", "Google Drive credential"],
              ["Gemini API Key (AIza...)", "HTTP Request header: x-goog-api-key"],
              ["Notion Integration Token", "HTTP Request Authorization Bearer"],
              ["Notion Database ID", "HTTP Request URL path"],
              ["WhatsApp Access Token", "HTTP Request Authorization Bearer"],
              ["WhatsApp Phone Number ID", "HTTP Request URL path segment"],
              ["Hiring Manager WhatsApp #", "HTTP Request body 'to' field"],
            ].map(([cred, dest]) => (
              <tr key={cred} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={{ padding: "8px 10px", color: "#e6edf3", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{cred}</td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, height: 28, width: "90%" }} />
                </td>
                <td style={{ padding: "8px 10px", color: "#8b949e", fontSize: 12 }}>{dest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BuildSection() {
  const [activeStep, setActiveStep] = useState(0);
  const step = BUILD_STEPS[activeStep];

  const renderDetails = (details) => {
    if (details.code) {
      return (
        <div>
          {Object.entries(details).filter(([k]) => k !== "code").map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <span style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1 }}>{k}: </span>
              <span style={{ color: "#e6edf3", fontSize: 13 }}>{v}</span>
            </div>
          ))}
          <CodeBlock code={details.code} />
        </div>
      );
    }
    if (details.body || details.prompt) {
      return (
        <div>
          {Object.entries(details).filter(([k]) => k !== "body" && k !== "prompt").map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <span style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1 }}>{k}: </span>
              <span style={{ color: "#e6edf3", fontSize: 13 }}>{v}</span>
            </div>
          ))}
          {(details.body || details.prompt) && (
            <>
              <div style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                {details.body ? "JSON Body:" : "Prompt Body:"}
              </div>
              <CodeBlock code={details.body || details.prompt} />
            </>
          )}
        </div>
      );
    }
    return (
      <div>
        {Object.entries(details).map(([k, v]) => (
          <div key={k} style={{ marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, minWidth: 120, flexShrink: 0 }}>{k}:</span>
            <span style={{ color: "#e6edf3", fontSize: 13, lineHeight: 1.6 }}>{v}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <SectionTitle>Step-by-Step Build Guide</SectionTitle>
      <Card style={{ background: "rgba(245,158,11,0.06)", borderColor: "#f59e0b44", marginBottom: 20 }}>
        <p style={{ color: "#f59e0b", margin: 0, fontSize: 14 }}>
          ⚡ The Gemini prompt is the most important part. An imprecise prompt produces inconsistent output that breaks the entire downstream workflow. Read Step 4 carefully before the session.
        </p>
      </Card>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Step Nav */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {BUILD_STEPS.map((s, i) => (
            <div
              key={i}
              onClick={() => setActiveStep(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                marginBottom: 6,
                cursor: "pointer",
                background: activeStep === i ? s.color + "18" : "transparent",
                border: `1px solid ${activeStep === i ? s.color + "66" : "transparent"}`,
                transition: "all 0.2s",
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: s.color + "22", border: `1.5px solid ${s.color}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: s.color, fontWeight: 900, fontSize: 12, fontFamily: "monospace",
                flexShrink: 0,
              }}>{s.num}</div>
              <span style={{ fontSize: 11, color: activeStep === i ? "#e6edf3" : "#6b7280", fontWeight: activeStep === i ? 700 : 400, lineHeight: 1.4 }}>{s.title}</span>
            </div>
          ))}
        </div>

        {/* Step Detail */}
        <div style={{ flex: 1 }}>
          <Card style={{ borderColor: step.color + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: step.color + "22", border: `2px solid ${step.color}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: step.color, fontWeight: 900, fontSize: 20, fontFamily: "monospace",
              }}>{step.num}</div>
              <div>
                <div style={{ color: "#e6edf3", fontWeight: 800, fontSize: 17 }}>{step.title}</div>
                <div style={{ color: "#8b949e", fontSize: 13, marginTop: 2 }}>{step.desc}</div>
              </div>
            </div>
            {renderDetails(step.details)}
          </Card>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            <button onClick={() => setActiveStep(Math.max(0, activeStep - 1))} disabled={activeStep === 0}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #30363d", background: "#161b22", color: activeStep === 0 ? "#4b5563" : "#e6edf3", cursor: activeStep === 0 ? "default" : "pointer", fontWeight: 700 }}>
              ← Previous
            </button>
            <Badge color={step.color}>Step {activeStep + 1} of {BUILD_STEPS.length}</Badge>
            <button onClick={() => setActiveStep(Math.min(BUILD_STEPS.length - 1, activeStep + 1))} disabled={activeStep === BUILD_STEPS.length - 1}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #30363d", background: "#161b22", color: activeStep === BUILD_STEPS.length - 1 ? "#4b5563" : "#e6edf3", cursor: activeStep === BUILD_STEPS.length - 1 ? "default" : "pointer", fontWeight: 700 }}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestingSection() {
  return (
    <div>
      <SectionTitle>Testing Guide</SectionTitle>

      <Card style={{ background: "#0d1117" }}>
        <h3 style={{ color: "#4ade80", fontSize: 16, margin: "0 0 12px", fontFamily: "monospace" }}>📄 Sample Test CV — Sarah Ahmed</h3>
        <pre style={{ color: "#c9d1d9", fontSize: 12.5, lineHeight: 1.8, fontFamily: "'Fira Code', monospace", margin: 0, whiteSpace: "pre-wrap" }}>
{`SARAH AHMED  │  FRONTEND DEVELOPER  │  Karachi, Pakistan
sarah.ahmed@example.com

EXPERIENCE
Junior Frontend Developer — TechStartup PK (2022–2024)
  - Built React dashboards for 3 enterprise clients
  - Integrated REST APIs and Firebase real-time database
  - Agile sprints, daily standups, code reviews

Freelance Web Developer (2021–2022)
  - 8 WordPress and Wix sites for local businesses

SKILLS: React, JavaScript, HTML/CSS, Firebase, Git, basic Python
EDUCATION: BS Computer Science — FAST NUCES 2021`}
        </pre>
      </Card>

      <SectionTitle>Successful Execution Checklist</SectionTitle>
      <Card>
        {[
          ["Sheets trigger", "New execution appears within 60 seconds of form submit"],
          ["Code node (extract)", "Output shows cv_base64 string, applicant_name, role fields populated"],
          ["Gemini HTTP node", "Response body contains candidates[0].content.parts[0].text with a JSON string"],
          ["Code node (parse)", "Output shows ai_score as a number, ai_recommendation as Strong Yes / Yes / No"],
          ["Notion HTTP node", "Response contains a 'url' field with link to new Notion page"],
          ["Notion database", "New card appears with all 9 properties filled including AI Score"],
          ["WhatsApp (if ≥ 7)", "Hiring manager receives formatted alert with Notion link"],
        ].map(([node, expected], i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: i < 6 ? "1px solid #21262d" : "none" }}>
            <div style={{ color: "#4ade80", fontSize: 20, flexShrink: 0 }}>☐</div>
            <div>
              <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{node}</div>
              <div style={{ color: "#c9d1d9", fontSize: 13, marginTop: 3 }}>{expected}</div>
            </div>
          </div>
        ))}
      </Card>

      <SectionTitle>Common Errors & Fixes</SectionTitle>
      {ERRORS.map((e, i) => (
        <Card key={i} style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace", marginBottom: 4, textTransform: "uppercase" }}>Error</div>
              <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>{e.error}</div>
            </div>
            <div>
              <div style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace", marginBottom: 4, textTransform: "uppercase" }}>Likely Cause</div>
              <div style={{ color: "#f59e0b", fontSize: 13 }}>{e.cause}</div>
            </div>
            <div>
              <div style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace", marginBottom: 4, textTransform: "uppercase" }}>Fix</div>
              <div style={{ color: "#4ade80", fontSize: 13 }}>{e.fix}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChallengesSection() {
  return (
    <div>
      <SectionTitle>Challenge Tasks</SectionTitle>
      <Card style={{ background: "rgba(96,165,250,0.06)", borderColor: "#60a5fa44", marginBottom: 20 }}>
        <p style={{ color: "#60a5fa", margin: 0, fontSize: 14, fontStyle: "italic" }}>
          💬 Do not help too early. The struggle is the point. Easy tasks keep slower participants moving. Hard tasks give your strongest participants something to push against.
        </p>
      </Card>

      {CHALLENGES.map(c => (
        <div key={c.level} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Badge color={c.color}>{c.level}</Badge>
            <span style={{ color: "#8b949e", fontSize: 13, fontFamily: "monospace" }}>{c.time}</span>
          </div>
          {c.tasks.map(t => (
            <Card key={t.title} style={{ background: c.bg, borderColor: c.color + "33" }}>
              <div style={{ color: c.color, fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{t.title}</div>
              <div style={{ color: "#c9d1d9", fontSize: 14, lineHeight: 1.6 }}>{t.desc}</div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConceptsSection() {
  return (
    <div>
      <SectionTitle>Concept Explainers</SectionTitle>
      {[
        {
          title: "🔁 New Node: Google Sheets Trigger",
          color: "#4ade80",
          text: "The Google Sheets trigger polls a spreadsheet every 1 minute and fires the workflow on new rows. It does not use webhooks — it uses polling. This means 0–60 second delay between form submission and execution. This is intentional: polling is more reliable for Google Forms because it doesn't require a public URL. The trigger stores which rows it has seen so it never processes the same submission twice."
        },
        {
          title: "🤖 New API: Gemini — Sending a File, Not Just Text",
          color: "#a78bfa",
          text: "Most AI API calls send text. This build sends a file — the CV in binary format, encoded as base64 — directly to Gemini as an inline_data object. Gemini can read PDF and DOCX natively. No separate OCR service needed. The model receives the document exactly as a human recruiter would open it, reading tables, bullet points, and formatting. This multimodal capability is what separates modern AI APIs from earlier generations."
        },
        {
          title: "📊 New API: Notion — Databases vs. Pages",
          color: "#ec4899",
          text: "In Notion's API model, a database is a collection of pages where each page has structured properties — like spreadsheet columns. When we POST to /v1/pages with a parent database_id, we create a new row in that database, which renders as a kanban card or table row. Properties must match the database schema exactly: type names, property names, and value formats must align with what you created in setup. This is the most common source of 400 errors."
        },
        {
          title: "🧠 The Pattern This Represents: Document Intelligence",
          color: "#f59e0b",
          text: "This project implements the Document Intelligence pattern: receive an unstructured document, extract meaning with AI, store as structured data. Same pattern used in insurance claim processing (PDF forms → AI extraction → database), legal document review (contracts → AI clause extraction → spreadsheet), medical record digitisation, and expense management (receipt photos → AI parsing → accounting software). Every company that handles paper or PDFs needs this pattern."
        },
        {
          title: "🏢 Real Company Equivalent",
          color: "#60a5fa",
          text: "This is exactly how Greenhouse and Workday's AI screening works. A recruiter defines criteria. Candidates upload CVs. AI scores them and surfaces the top ones. Greenhouse charges $6,000+ per year for this feature. You just built a functional version using Gemini, Notion, and n8n for zero recurring cost. The production difference is scale and compliance — not capability."
        },
      ].map(c => (
        <Card key={c.title} style={{ borderLeft: `3px solid ${c.color}`, borderRadius: "0 14px 14px 0" }}>
          <h3 style={{ color: c.color, fontSize: 16, margin: "0 0 10px", fontFamily: "'Playfair Display', serif" }}>{c.title}</h3>
          <p style={{ color: "#c9d1d9", lineHeight: 1.7, margin: 0, fontSize: 14 }}>{c.text}</p>
        </Card>
      ))}
    </div>
  );
}

function ReferenceSection() {
  return (
    <div>
      <SectionTitle>Quick Reference Card</SectionTitle>

      <SectionTitle>All Expressions Used</SectionTitle>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d" }}>
              {["Expression", "Returns", "Used In"].map(h => <th key={h} style={{ textAlign: "left", color: "#8b949e", padding: "8px 10px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ["$json['Full Name']", "Applicant name string", "Code node → Notion"],
              ["$json.cv_base64", "Base64 encoded CV file", "Gemini HTTP body"],
              ["$json.ai_score", "Integer 1–10", "IF node threshold check"],
              ["$json.ai_strengths", "AI-written paragraph", "Notion Strengths property"],
              ["$json.ai_recommendation", "Strong Yes / Yes / No", "Notion + WhatsApp alert"],
              ["$('HTTP Request3').item.json.url", "Notion page URL", "WhatsApp alert body"],
              ["candidates[0].content.parts[0].text", "Raw Gemini text output", "Code node JSON.parse input"],
            ].map(([exp, ret, use]) => (
              <tr key={exp} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={{ padding: "8px 10px" }}><code style={{ background: "#0d1117", padding: "2px 8px", borderRadius: 6, color: "#4ade80", fontSize: 12 }}>{exp}</code></td>
                <td style={{ padding: "8px 10px", color: "#c9d1d9", fontSize: 12 }}>{ret}</td>
                <td style={{ padding: "8px 10px", color: "#8b949e", fontSize: 12 }}>{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Notion API — Property Type Cheat Sheet</SectionTitle>
      <Card>
        {NOTION_TYPES.map(n => (
          <div key={n.type} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Badge color="#a78bfa">{n.type}</Badge>
              <span style={{ color: "#8b949e", fontSize: 12 }}>{n.use}</span>
            </div>
            <CodeBlock code={n.json} />
          </div>
        ))}
      </Card>

      <SectionTitle>Node Sequence Summary</SectionTitle>
      <Card>
        {BUILD_STEPS.map(s => (
          <div key={s.num} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: s.num < 8 ? "1px solid #21262d" : "none" }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: s.color + "22", border: `1.5px solid ${s.color}66`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: s.color, fontWeight: 900, fontSize: 13, fontFamily: "monospace",
              flexShrink: 0,
            }}>{s.num}</div>
            <div>
              <div style={{ color: "#e6edf3", fontWeight: 700, fontSize: 14 }}>{s.title}</div>
              <div style={{ color: "#8b949e", fontSize: 12, marginTop: 2 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ background: "rgba(96,165,250,0.06)", borderColor: "#60a5fa44", textAlign: "center", padding: "28px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
        <p style={{ color: "#e6edf3", fontSize: 15, lineHeight: 1.8, margin: 0, fontFamily: "'Playfair Display', serif" }}>
          You just built the AI screening layer that Greenhouse charges <strong style={{ color: "#ef4444" }}>$6,000/year</strong> for. Gemini reads the CV. Notion organises every candidate. The hiring manager only sees the ones worth their time. That is what automation changes — not the outcome, but <em>where human attention goes</em>.
        </p>
      </Card>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [active, setActive] = useState("brief");

  const renderSection = () => {
    switch (active) {
      case "brief": return <BriefSection />;
      case "architecture": return <ArchitectureSection />;
      case "setup": return <SetupSection />;
      case "build": return <BuildSection />;
      case "testing": return <TestingSection />;
      case "challenges": return <ChallengesSection />;
      case "concepts": return <ConceptsSection />;
      case "reference": return <ReferenceSection />;
      default: return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #161b22 0%, #1c2128 100%)",
        borderBottom: "1px solid #30363d",
        padding: "20px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <Badge color="#60a5fa">WORKSHOP 2.0</Badge>
              <Badge color="#4ade80">LEVEL 1</Badge>
              <Badge color="#a78bfa">PROJECT 02</Badge>
            </div>
            <h1 style={{ margin: 0, color: "#e6edf3", fontSize: 22, fontWeight: 900, fontFamily: "'Playfair Display', Georgia, serif" }}>
              AI-Powered CV Screener with Notion Talent Board
            </h1>
            <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
              n8n · Gemini AI · Google Forms · Notion · WhatsApp — 100% Free Stack
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <div style={{
          width: 230,
          background: "#161b22",
          borderRight: "1px solid #30363d",
          padding: "16px 12px",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}>
          {NAV_SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", textAlign: "left",
                padding: "10px 14px", borderRadius: 10, marginBottom: 4,
                border: "none",
                background: active === s.id ? "rgba(96,165,250,0.12)" : "transparent",
                borderLeft: active === s.id ? "3px solid #60a5fa" : "3px solid transparent",
                color: active === s.id ? "#e6edf3" : "#6b7280",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active === s.id ? 700 : 400,
                transition: "all 0.15s",
              }}
            >
              <span>{s.icon}</span>
              <span style={{ lineHeight: 1.4 }}>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto", maxWidth: 900 }}>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
