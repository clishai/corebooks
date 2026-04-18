# Contributing to CoreBooks

Thank you for your interest in CoreBooks. This document explains how to get involved, whether you're reporting a bug, suggesting a feature, or submitting code.

## How GitHub Collaboration Works

CoreBooks lives on GitHub. GitHub is a platform where developers host code, track issues, and collaborate. Here's the basic model:

- **Issues** are used to report bugs, ask questions, and propose features. Anyone can open one.
- **Discussions** are used for broader conversations — ideas, design questions, community topics.
- **Pull Requests (PRs)** are how code changes get proposed and reviewed. A contributor forks the repo, makes changes in a branch, and opens a PR to merge those changes in.
- **Forks** are personal copies of the repository. Contributors work in their fork without affecting the main project until a PR is opened.

## Reporting Bugs

Open a [GitHub Issue](../../issues/new) and include:

- A clear description of the problem
- Steps to reproduce it
- What you expected to happen vs. what actually happened
- Your environment (OS, Node.js version)

## Suggesting Features

Open a [GitHub Issue](../../issues/new) with the label `enhancement`. Describe:

- The problem you're trying to solve
- Your proposed solution
- How it fits the CoreBooks philosophy (self-hosted, privacy-first, accounting-correct)

## Submitting Code

1. **Fork** the repository to your GitHub account
2. **Clone** your fork locally
3. **Create a branch** for your change: `git checkout -b feature/your-feature-name`
4. **Make your changes** — follow the coding standards below
5. **Write tests** for any new logic
6. **Commit** with a clear message (see commit format below)
7. **Push** your branch to your fork
8. **Open a Pull Request** against `main` in this repository

## Commit Message Format

CoreBooks uses Conventional Commits (https://www.conventionalcommits.org/):

    type: short description of the change

Common types:
- `feat:` — a new feature
- `fix:` — a bug fix
- `docs:` — documentation only
- `test:` — adding or updating tests
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `chore:` — maintenance, tooling, dependency updates

Examples:

    feat: add journal entry validation
    fix: correct debit/credit balance calculation
    docs: update README with setup instructions
    test: add trial balance tests

## Code Standards

- All code is written in TypeScript with strict mode enabled
- The core layer (`src/core/`) must have zero external dependencies
- Every new function in the core must have a corresponding test
- The accounting equation must hold after every operation: Assets = Liabilities + Equity

## Code of Conduct

CoreBooks follows the Contributor Covenant (https://www.contributor-covenant.org/) Code of Conduct. Be respectful, constructive, and welcoming.