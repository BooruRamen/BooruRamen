# Contributing to BooruRamen

First off, thank you for considering contributing to BooruRamen! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs
This section guides you through submitting a bug report.
- **Check the Issues**: Look through existing issues to check if the bug has already been reported.
- **Open a New Issue**: If it's new, open an issue using the "Bug Report" template. Include clear reproduction steps, your OS version, and any relevant logs.

### Suggesting Enhancements
- **Open a Feature Request**: Use the "Feature Request" template in the Issues tab.
- **Describe the Goal**: Clearly explain what you want to achieve and why it would be useful to other users.

## Development Setup

To start coding, follow these steps to set up your local development environment.

### Prerequisites
- **Node.js**: v14 or newer
- **Rust**: Required for Tauri backend development. (See [tauri.app](https://tauri.app/v1/guides/getting-started/prerequisites) for setup instructions)
- **npm** or **yarn**

### Installation

1. **Fork the repository** on GitHub.

2. **Clone your fork**:
    git clone https://github.com/YOUR-USERNAME/BooruRamen.git
    cd BooruRamen

3. **Install dependencies**:
    npm install

### Running Locally

Start the development server with hot-reload:

    npm run dev

The application should open at http://localhost:5173.

### Building the App

To verify that the app compiles correctly before submitting:

    npm run build

Tauri .exe Build:

    npm run tauri build

Tauri .apk Build:

    npm run tauri android build -- --apk true

## Pull Request Process

1. **Create a Branch**: Create a new branch for your feature or bugfix.
    git checkout -b feature/amazing-feature
    # or
    git checkout -b fix/annoying-bug

2. **Coding Standards**:
   - We use **ESLint** for linting. Please ensure your code passes linting before committing:
     npm run lint
   - Follow the existing code style (Vue 3 Composition API, Tailwind CSS classes).

3. **Commit Messages**: Use clear, descriptive commit messages.
   - Good: "fix: resolve crash when loading video on profile page"
   - Bad: "fixed bug"

4. **Push and PR**: Push to your fork and submit a Pull Request to the `main` branch.
   - Describe your changes in detail.
   - Link any related issues (e.g., "Closes #123").

## Project Structure

- **src/**: Vue frontend source code.
  - **views/**: Page-level components (Feed, Profile, etc.).
  - **components/**: Reusable UI components.
  - **stores/**: Pinia state management files.
  - **services/**: Logic for Booru APIs and recommendation algorithms.
- **src-tauri/**: Rust backend code (Tauri configuration and handlers).

## License

By contributing, you agree that your contributions will be licensed under the project's [GPL-3.0 License](../LICENSE).