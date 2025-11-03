---
# 🧠 MediTrack AI — Project Summary & Workflow
---

## 📋 Project Summary

MediTrack AI is an intelligent medication reminder agent designed to help both patients and caregivers manage and adhere to medication schedules effortlessly.
It’s built using Mastra (for AI-driven understanding and intent extraction) and integrates with Telex.im via the A2A protocol, ensuring all communications are structured in JSON for consistency and automation.

## 💡 Core Idea

Many people forget to take their medications or struggle to manage multiple drug schedules — especially caregivers handling multiple patients.
MediTrack AI solves this by automatically scheduling reminders, confirming medication intake, and tracking adherence — all inside a familiar chat interface on Telex.im.

## 🎯 Project Goals

Automate medication reminders for patients and caregivers.

Improve medication adherence and treatment outcomes.

Provide a conversational, human-like interface powered by AI.

Use the A2A JSON protocol for structured, machine-readable communication.

Support flexible reminder intervals — daily, 6-hourly, 8-hourly, and 12-hourly.

## 👥 User Roles

### 🧍 Patient

Uses MediTrack AI to set up personal medication reminders.

Receives reminders (e.g., “💊 Time to take 500mg Paracetamol”).

Confirms when doses are taken (“✅ Taken”).

Views upcoming doses or missed doses.

### 👩‍⚕️ Caregiver

Uses MediTrack AI to manage medication schedules for multiple patients.

Gets notified when it’s time to give a specific patient their dose.

Can confirm doses as “given” and review patient logs.

## ⚙️ Workflow Overview

Here’s how the system works from end to end 👇

### 1️⃣ User Initiation

The user (patient or caregiver) starts a chat with the agent in Telex.im.
Telex sends the user’s message to the agent as a JSON payload through the A2A webhook.

Example:

````bash
{
  "event": "message.created",
  "data": { "message": { "text": "Remind me to take Amoxicillin every 8 hours starting 6 AM" } }
}
``

### 2️⃣ Role Setup

The agent first determines the user’s role:

Patient → for personal reminders.

Caregiver → for managing others’ reminders.

Response (JSON):
```bash
{
  "version": "1.0",
  "response": {
    "type": "message",
    "data": {
      "text": "Are you a caregiver or a patient?",
      "actions": [
        { "type": "button", "label": "Caregiver", "action_id": "set_role_caregiver" },
        { "type": "button", "label": "Patient", "action_id": "set_role_patient" }
      ]
    }
  }
}
````

### 3️⃣ Medication Setup

Once the role is set, the user adds medication details:

Medicine name

Dosage (e.g., 500mg or 10ml)

Frequency (daily / 6h / 8h / 12h)

Start time (e.g., 6:00 AM)

Duration (e.g., 5 days)

Mastra extracts this data from natural language input:

```bash
{
  "intent": "add_medication",
  "medicineName": "Amoxicillin",
  "dosage": "500mg",
  "frequencyHours": 8,
  "startTime": "06:00",
  "durationDays": 5
}
```

### 4️⃣ Schedule Creation

The backend stores this data in MongoDB, then creates reminder tasks using a scheduler (e.g., node-cron or agenda).

Each reminder time is computed from:

startTime + (n \* frequencyHours)

### 5️⃣ Reminder Notifications

At each reminder time, the agent sends a JSON message back to Telex:

```bash
{
  "chat_id": "chat-123",
  "message": {
    "text": "💊 Time to take your 500mg Amoxicillin.",
    "actions": [{ "type": "button", "label": "✅ Taken", "action_id": "confirm_taken" }]
  }
}
```

Telex delivers it to the user instantly.

### 6️⃣ Confirmation & Tracking

When the user clicks “✅ Taken,” Telex notifies the agent again via JSON:

```bash
{
  "event": "action.clicked",
  "data": { "action_id": "confirm_taken", "sender_id": "user-123" }
}
```

The agent then:

Logs the confirmation in MongoDB.

Sends a success response:

```bash
{
  "version": "1.0",
  "response": {
    "type": "message",
    "data": { "text": "👏 Great! I’ve marked this dose as taken." }
  }
}
```

### 7️⃣ Optional: Daily Summary

Each day, the agent can summarize progress for the user:

“You took 3 out of 3 doses today. Keep it up!”

### 8️⃣ Caregiver Workflow

For caregivers, the system supports multiple patients:

Each patient’s medication schedule is stored separately.

The caregiver receives distinct reminders per patient.

They can view each patient’s medication summary on demand.

## 🧩 System Components

Component Function
Telex.im Chat interface; handles A2A messaging
Mastra AI Parses text, extracts medicine details, frequency, duration
Express Server Handles webhook, routes requests
MongoDB Stores users, schedules, and confirmations
Scheduler (node-cron/agenda) Triggers reminders
A2A JSON Formatter Formats responses for Telex compliance

## 🧠 Data Flow Summary

flowchart TD
A[User sends message in Telex] --> B[Telex sends JSON webhook to MediTrack Agent]

B --> C[Mastra parses text and extracts medication info]
C --> D[MongoDB stores user + medication schedule]
D --> E[Scheduler sets reminders]
E --> F[Reminder fires → sends JSON back to Telex]
F --> G[Telex displays reminder message with buttons]
G --> H[User clicks “✅ Taken” → JSON sent back]
H --> I[Agent logs confirmation + sends acknowledgment]

## 📈 Key Outcomes

✅ Automated, reliable medication reminders
✅ Dual usability (patient + caregiver)
✅ Fully JSON/A2A compliant
✅ Smart scheduling with customizable intervals
✅ Easy extension to add analytics, voice alerts, or summaries
