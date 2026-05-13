# 🧠 AOTT AI MVP Factory — Spec-Driven Development System

This repository is a **starter template for AOTT’s AI-powered MVP Factory**, enabling fully **Spec-Driven Development** using Claude as an orchestrator.

---

# 🚀 Overview

This system transforms a simple idea into a working product through:

* AI-generated specifications
* Agent-based execution
* Skill-based architecture
* Structured outputs
* Continuous learning via context

---

# 🎯 Core Principles

* Specs are the **only source of truth**
* **No coding without specs**
* Input is minimal → AI expands it
* Skills are explicit and composable
* Agents execute per phase
* System improves via context + playbook

---

# 📂 Project Structure

```bash
AI-PROJECT-STARTER/

  claude.md              # 🧠 AI Orchestrator (core brain)

  README.md              # 📘 This file

  /ai
    /agents              # 🤖 Execution agents
      /global
      /shopify
      /netsuite

  /skills                # 🧩 Capability definitions
    /global
    /shopify
    /netsuite

  /input                 # 📥 ONLY required input
    idea.json

  /output                # 📤 All generated artifacts
    /specs               # Specifications (source of truth)
    /src                 # Generated code
    /tests               # Tests
    /docs                # Documentation
    /context             # Memory + learnings

  /src                   # (Optional manual additions if needed)
```

---

# 🧠 System Layers

---

## 1. Input Layer

```bash
/input/idea.json
```

This is the **only file you must provide**.

### Example:

```json
{
  "problem": "Merchants cannot sync Shopify data between environments",
  "solution": "A tool to migrate and sync Shopify data selectively"
}
```

👉 You do NOT need full specs
👉 Claude will infer everything else

---

## 2. Specification Layer

Generated automatically into:

```bash
/output/specs/
```

Includes:

* `product.md`
* `architecture.md`
* `data-model.json`
* `api.yaml`
* `logic.md`
* `ui.md`
* `shopify.md` (if applicable)
* `netsuite.md` (if applicable)

---

## 3. Execution Layer

Claude (via `claude.md`) will:

* Interpret commands
* Select agents
* Compose skills
* Generate outputs into `/output/*`

---

## 4. Context Layer

```bash
/output/context/
```

Stores:

* decisions.json
* learnings.json
* errors.json
* performance.json

Used for:

* Continuous improvement
* Future automation
* Playbook updates

---

# 🤖 Agents

Located in:

```bash
/ai/agents/
```

---

## Core Agents

* Spec Generator Agent
* Architecture Agent
* Planning Agent
* QA Agent
* Playbook Agent

---

## Shopify Agents

* Shopify Spec Generator
* Shopify Theme Agent
* Shopify App Agent
* Shopify Functions Agent
* Shopify Data Agent

---

## NetSuite Agents

* SuiteScript Agent
* SDF Agent
* NetSuite Integration Agent

---

# 🧩 Skills

Located in:

```bash
/skills/
```

---

## Global Skills

* Enterprise Architect
* API Designer
* Data Modeler
* Auth Specialist
* Performance Optimizer
* QA/Test Generator
* Node Backend Engineer
* React Frontend Engineer
* UX Designer

---

## Shopify Skills

* Theme Developer
* App Developer
* Functions Engineer
* Hydrogen Engineer
* Metafields Architect
* B2B/Markets Specialist
* Checkout Extensibility Engineer
* Flow Automation Engineer
* Integration Specialist

---

## NetSuite Skills

* SuiteScript Architect
* NetSuite Data Modeler
* SuiteCommerce Architect
* Integration Specialist
* Workflow Automation Specialist
* SDF Deployment Specialist
* Permissions Specialist
* Reporting Specialist
* Performance Optimizer

---

# 🧭 How to Use

---

## 1. Define Your Idea

Edit:

```bash
/input/idea.json
```

Minimal input is enough.

---

## 2. Generate Specs

```bash
COMMAND: SPEC::GENERATE
```

Claude will:

* Analyze the idea
* Detect platform (Shopify / NetSuite / SaaS)
* Generate all specs in `/output/specs`
* Fill missing details intelligently

---

## 3. Refine Specs (Optional)

```bash
COMMAND: SPEC::REFINE
```

---

## 4. Plan

```bash
COMMAND: PLAN::ARCHITECTURE
COMMAND: PLAN::TASKS
```

---

## 5. Build

```bash
COMMAND: BUILD::IMPLEMENT
```

Outputs go to:

```bash
/output/src
/output/tests
/output/docs
```

---

## 6. Validate

```bash
COMMAND: QA::RUN
```

---

## 7. Deliver

```bash
COMMAND: DEPLOY::PREPARE
```

---

# 🧠 Spec Generation Philosophy

You are NOT expected to define full specs.

Instead:

👉 You provide intent
👉 Claude builds structure

---

## Claude Responsibilities

* Infer missing details
* Make assumptions (explicitly)
* Generate complete specs
* Iterate and refine

---

## Example

Input:

```json
{
  "problem": "B2B customers cannot see custom pricing",
  "solution": "Show pricing per company"
}
```

Claude will infer:

* Shopify B2B OR NetSuite pricing
* Data models
* UI flows
* APIs
* Integrations

---

# 🔁 Iteration Model

All changes MUST follow:

1. Update specs (`/output/specs`)
2. Then update implementation

---

# 🚫 Rules

* No coding without specs
* No skipping phases
* No implicit logic
* No unstructured outputs

---

# 🎯 Goal

This system enables AOTT to operate as a:

> **Spec-Driven, AI-Orchestrated MVP Factory**

Where:

* Ideas → Specs → Products → Learnings

---

# ⚡ Quick Start

```bash
# 1. Define idea
/input/idea.json

# 2. Generate specs
COMMAND: SPEC::GENERATE

# 3. Build
COMMAND: BUILD::IMPLEMENT
```

---

# 🧠 Final Thought

You are not writing features.

You are building a system where:

* Specs define reality
* AI executes
* Your company scales through structure

👉 This is a **programmable product factory**.
