# GitStats

Generate GitHub language stats SVGs for profile READMEs.

GitStats can show both long-term language composition and recent language activity:

- **Most Used Languages** uses GitHub language byte totals from the current repository state.
- **Recent Languages** uses commit file change counts from a configurable number of weeks.
- Both representations can render as **Extended** or **Compact** cards.
- All variants include internal horizontal padding and a subtle card background that remains distinct from GitHub's page background in light and dark mode.
- Settings can live in your README through named `gitstats:config` blocks.

## Quick Setup

This default template generates two cards:

- Most Used Languages, Extended, all-time bytes.
- Recent Languages, Compact, last 8 weeks of changes.

Add this workflow to the repository where the SVG files should be committed. For a GitHub profile README, that is usually `YOUR_USERNAME/YOUR_USERNAME`.

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

      - name: Generate most used languages
        uses: One-Simon/GitStats@main
        with:
          token: ${{ secrets.GITSTATS_TOKEN }}
          username: YOUR_USERNAME
          output: profile/languages-most-used.svg
          config-name: most-used

      - name: Generate recent languages
        uses: One-Simon/GitStats@main
        with:
          token: ${{ secrets.GITSTATS_TOKEN }}
          username: YOUR_USERNAME
          output: profile/languages-recent.svg
          config-name: recent

      - name: Commit generated SVGs
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add profile/languages-most-used.svg profile/languages-recent.svg
          git commit -m "Update language stats" || exit 0
          git push
```

Then add this to your `README.md`:

```md
<!-- gitstats:config most-used
style: normal
timeframe: all-time
gitstats:config -->

<!-- gitstats:config recent
style: compact
timeframe: 8
gitstats:config -->

<p align="center">
  <img width="100%" src="./profile/languages-most-used.svg" alt="Most used programming languages" />
  <img width="100%" src="./profile/languages-recent.svg" alt="Recent programming languages" />
</p>
```

Run the workflow once from the Actions tab. After the first successful run, the generated SVGs will be committed and displayed in your README.

## Configuration

GitStats reads settings from `gitstats:config` blocks in your README. Use `config-name` in the workflow to select which block should drive that action run.

Only set the values you want to change. Omitted settings use the defaults below.

```md
<!-- gitstats:config example-name
style: normal
timeframe: all-time
gitstats:config -->
```

| Setting | Default | Description |
| --- | --- | --- |
| `title` | Automatic | Optional card title override. Defaults to `Most Used Languages` for `all-time`, or `Recent Languages` for numbered timeframes. |
| `style` | `normal` | `normal` renders the extended card with a list. `compact` renders a thicker labeled bar. |
| `timeframe` | `all-time` | `all-time` uses GitHub language bytes. A number, such as `8`, uses recent commit changes from that many weeks. |
| `show-values` | `true` | Shows byte or change totals in the normal renderer. Compact always shows percentages only. |
| `max-languages` | `10` | Maximum number of languages to display before truncating. |
| `hide-languages` | `HTML,CSS` | Comma-separated languages to exclude after loading all detected languages. |
| `include-forks` | `false` | Includes forked repositories. |
| `include-archived` | `false` | Includes archived repositories. |
| `include-profile-repo` | `false` | Includes the `username/username` profile repository. |
| `affiliation` | `owner` | Repository affiliation passed to GitHub. Use `owner,collaborator,organization_member` for broader access. |
| `visibility` | `all` | Repository visibility passed to GitHub. |

The subtitle is always generated from `timeframe`: `all-time` for all-time renders, or `last N weeks` for numbered timeframes.

## Variants

### Most Used Languages, Extended

```md
<!-- gitstats:config most-used-extended
style: normal
timeframe: all-time
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/most-used-extended.svg" alt="Most Used Languages extended example" />
</p>

### Most Used Languages, Compact

```md
<!-- gitstats:config most-used-compact
style: compact
timeframe: all-time
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/most-used-compact.svg" alt="Most Used Languages compact example" />
</p>

### Recent Languages, Extended

```md
<!-- gitstats:config recent-extended
style: normal
timeframe: 8
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/recent-extended.svg" alt="Recent Languages extended example" />
</p>

### Recent Languages, Compact

```md
<!-- gitstats:config recent-compact
style: compact
timeframe: 8
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/recent-compact.svg" alt="Recent Languages compact example" />
</p>

## Action Inputs

README config blocks are recommended for display settings. Workflow inputs are still useful for secrets, output paths, and selecting a config block.

| Input | Default | Description |
| --- | --- | --- |
| `token` | Required | GitHub token used to read repositories, language data, and recent commit data. |
| `username` | Repository owner | GitHub username to generate stats for. |
| `output` | `profile/languages.svg` | Output SVG path. |
| `readme-config` | `README.md` | README path containing GitStats config blocks. Set to an empty string to disable README config. |
| `config-name` | Empty | Named README config block to use, for example `most-used` or `recent`. |
| `max-languages` | `10` | Maximum number of languages to display. |
| `hide-languages` | `HTML,CSS` | Languages to exclude after loading all detected languages. |
| `include-forks` | `false` | Include forked repositories. |
| `include-archived` | `false` | Include archived repositories. |
| `include-profile-repo` | `false` | Include the `username/username` profile repository. |
| `affiliation` | `owner` | Repository affiliation passed to GitHub. |
| `visibility` | `all` | Repository visibility passed to GitHub. |
| `title` | Automatic | Card title if README config is disabled. |
| `timeframe` | `all-time` | `all-time` for language bytes, or a number of weeks for recent changes. |
| `style` | `normal` | Rendering style. |
| `show-values` | `true` | Show byte or change totals in the normal renderer. |
| `user-agent` | `GitStats-language-card` | User-Agent used for GitHub API requests. |

## Token Setup

GitStats needs a Personal Access Token because the default `GITHUB_TOKEN` only has access to the repository running the workflow.

Recommended secret name:

```text
GITSTATS_TOKEN
```

For classic Personal Access Tokens:

```text
repo
read:user
```

For fine-grained Personal Access Tokens:

- Set **Repository access** to the repositories you want included, or **All repositories**.
- Set **Repository permissions -> Metadata** to **Read-only**.
- For recent renders such as `timeframe: 8`, also set **Repository permissions -> Contents** to **Read-only**.
- If the token is scoped to an organization with SSO, authorize the token for that organization.

## How It Works

1. Lists repositories visible to the token.
2. Filters repositories by owner, forks, archived status, and profile repository settings.
3. Chooses the metric from `timeframe`.
4. For `timeframe: all-time`, reads GitHub language byte totals.
5. For a numbered timeframe, reads commits since that many weeks ago and aggregates changed files by language.
6. Applies `hide-languages` and `max-languages`.
7. Renders the selected SVG style.

## Notes

- All-time numbers are GitHub language byte counts, not lines of code.
- Recent numbers are commit file change counts, usually additions plus deletions. They show activity, not how much code exists in that language.
- SVGs are vector graphics. Use README image width attributes, such as `<img width="70%">`, to control display size.
- Recent language detection is based on changed file paths and extensions.
- Private repository names and source code are not written to the SVG.
- Generated SVGs are public if committed to a public repository.

## License

MIT
