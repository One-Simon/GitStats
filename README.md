# GitStats

Generate a clean GitHub language statistics SVG for your profile README.

GitStats is a small GitHub Action that reads the repositories your token can access, asks GitHub for each repository's language breakdown, aggregates the results, and writes a static SVG you can embed in your README.

It is designed for people who want a simple language card without a hosted service, without npm installs, and with optional private repository support.

## What It Shows

- Top programming languages by GitHub language byte count
- Percentages across all included repositories
- Human-readable byte totals
- A compact SVG card suitable for profile READMEs
- Public and private repositories, if your token has access

GitStats uses GitHub's official REST API and the same language data GitHub exposes through each repository's language endpoint.

## Quick Start

Add this workflow to your profile README repository, usually `YOUR_USERNAME/YOUR_USERNAME`:

```yaml
name: GitStats

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  languages:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6

      - name: Generate language stats
        uses: One-Simon/GitStats@main
        with:
          token: ${{ secrets.GITSTATS_TOKEN }}
          username: YOUR_USERNAME
          output: profile/languages.svg
          max-languages: 10
          hide-languages: HTML,CSS

      - name: Commit generated SVG
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add profile/languages.svg
          git commit -m "Update language stats" || exit 0
          git push
```

Then add this to your `README.md`:

```md
<p align="center">
  <img src="./profile/languages.svg" alt="Most used programming languages" />
</p>
```

Run the workflow manually once from the Actions tab. After the first successful run, the SVG will be committed to your repository and shown in your README.

## Token Setup

GitStats needs a token because the default `GITHUB_TOKEN` can only see the repository running the workflow. To include your own private repositories, create a Personal Access Token and store it as a repository secret.

Recommended secret name:

```text
GITSTATS_TOKEN
```

Recommended token permissions:

For classic Personal Access Tokens:

```text
repo
read:user
```

For fine-grained Personal Access Tokens, grant access to the repositories you want included and allow read access to repository metadata/contents where applicable.

Add the secret in your profile repository:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

The token is never written to the generated SVG or README. It is only used during the workflow run to read GitHub API data.

## Public Repositories Only

If you only want public repository stats, you can use GitHub's default workflow token:

```yaml
- name: Generate language stats
  uses: One-Simon/GitStats@main
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    username: YOUR_USERNAME
```

For most profile use cases, a PAT is still recommended because it can see the full repository set you choose to expose in the aggregate stats.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `token` | required | GitHub token used to read repository and language data. |
| `username` | workflow owner | GitHub username to generate stats for. |
| `output` | `profile/languages.svg` | Output SVG path. |
| `max-languages` | `10` | Maximum number of languages to display. |
| `hide-languages` | `HTML,CSS` | Comma-separated languages to exclude. |
| `include-forks` | `false` | Include forked repositories. |
| `include-archived` | `false` | Include archived repositories. |
| `include-profile-repo` | `false` | Include the `username/username` profile repo. |
| `affiliation` | `owner` | Repository affiliation passed to `/user/repos`. |
| `visibility` | `all` | Repository visibility passed to `/user/repos`: `all`, `public`, or `private`. |
| `title` | `Most Used Languages` | Card title. |
| `subtitle` | `public + private` | Small label in the top-right of the card. |
| `user-agent` | `GitStats-language-card` | User-Agent used for GitHub API requests. |

## Example: Include Forks

```yaml
- name: Generate language stats
  uses: One-Simon/GitStats@main
  with:
    token: ${{ secrets.GITSTATS_TOKEN }}
    username: YOUR_USERNAME
    include-forks: true
```

## Example: Private Repositories Only

```yaml
- name: Generate language stats
  uses: One-Simon/GitStats@main
  with:
    token: ${{ secrets.GITSTATS_TOKEN }}
    username: YOUR_USERNAME
    visibility: private
    subtitle: private repos
```

## Example: Custom Card Text

```yaml
- name: Generate language stats
  uses: One-Simon/GitStats@main
  with:
    token: ${{ secrets.GITSTATS_TOKEN }}
    username: YOUR_USERNAME
    title: Language Breakdown
    subtitle: selected repos
```

## How It Works

1. Lists repositories visible to the token using GitHub's `/user/repos` endpoint.
2. Filters repositories by owner, forks, archived status, and profile repo settings.
3. Reads language byte counts from `/repos/{owner}/{repo}/languages`.
4. Aggregates bytes by language.
5. Renders a static SVG.
6. Your workflow commits that SVG to your profile repository.

GitHub calculates repository language statistics with Linguist. GitStats does not inspect your source code directly; it uses GitHub's already-calculated language data.

## Notes And Limitations

- The numbers are byte counts from GitHub's language API, not literal lines of code.
- Hidden languages are removed before percentages are calculated.
- Private repositories are included only if your token can read them.
- The generated SVG is public if committed to a public profile repository, so it can reveal aggregate language usage from private repositories.
- The SVG does not reveal private repository names or source code.

## Security

Do not commit tokens or secrets. Always pass tokens through GitHub Actions secrets:

```yaml
token: ${{ secrets.GITSTATS_TOKEN }}
```

For public profiles, consider whether aggregate private repository language stats are something you are comfortable showing publicly.

## License

MIT
