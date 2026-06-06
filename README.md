# GitStats

Configurable GitHub Profile language statistics breakdowns.

GitStats is a fully configurable stats Card for your Github Profile.

I didn´t like the functionality, nor the flexibility of existing projects. Hope you enjoy :)

## At a Glance

- | README-driven config | `gitstats:config`blocks allow easy configurability. |
- | Managed display | Paired `gitstats:display` markers auto generate Cards. |
- | Flexible timeframe | Use `all-time` language bytes or a recent weeks. |
- | Two styles | `normal` extended bar & list. `compact` labeled bar. |
- | Language cleanup | Hide languages, group entries into `Other`, and fully configure visibility. |
<p align="center">
  <img width="100%" src="./examples/most-used-extended.svg" alt="GitStats normal language example" />
</p>


## Quick Setup

Creates the default pair

| Card | Style | Timeframe |
| --- | --- | --- |
| Most Used Languages | `normal` | `all-time` |
| Recent Languages | `compact` | `8 weeks` |

### 1. Add the Workflow

Add this workflow to the repository where the Cards should be displayed.  
For a GitHub profile README, that is usually `YOUR_USERNAME/YOUR_USERNAME`.

GitStats is published as a reusable GitHub Action, which needs the workflow to function.  
The workflow decides when the action runs and grants write permission to the current repository.  
GitStats then reads README config blocks, generates Cards, updates managed display sections & updates the Cards automatically.  

```yaml
name: GitStats

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths-ignore:
      - "profile/*.svg"

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
```


### 2. Add Config Blocks in README

Add a Config Block inside the README for each Card.
Each Card can have a set of [settings](#settings) that let you customize them extensively. 
Almost all of them are optional. Only set the values you want to change.
```md
<!-- gitstats:config
style: normal
timeframe: all-time
gitstats:config -->

<!-- gitstats:config
style: compact
timeframe: 8
gitstats:config -->
```



### 3. Add a Display Section

```md
<div align="center">
<!-- gitstats:display -->
<!-- gitstats:display -->
</div>
```

GitStats rewrites the content between the display markers with generated image tags. 
You do not need to add SVG paths or `<img>` tags yourself. 
The surrounding `<div>` is yours, so you can center the cards, place them in a table, or use any other README layout GitHub supports.

[!TIP]
You can also display the Cards seperate from one another and display them wherever you like.

For this, name the Configuration blocks: 
```md
<!-- gitstats:config allTime
style: normal
timeframe: all-time
gitstats:config -->

<!-- gitstats:config recent
style: compact
timeframe: 8
gitstats:config -->
```

The block names become the Card names. These examples generate `profile/most-used.svg` and `profile/recent.svg`.

Then display them seperately:
```md
<div align="center">
<!-- gitstats:display allTime-->
<!-- gitstats:display allTime-->
</div>

-----------------

<div align="center">
<!-- gitstats:display recent-->
<!-- gitstats:display recent-->
</div>
```

### Token Setup

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


### 4. Run Once

Run the Workflow / Action once from the Actions tab. 
After the first successful run, the generated Cards will be committed and displayed in your README.

> [!TIP]
> To change a card later, edit the matching `gitstats:config` block and rerun the workflow. 
[WARNING]
DO NOT eidt the generated content between display markers.



## How it works

GitStats reads every `gitstats:config` block in your README and generates one Card for each block.

```md
<!-- gitstats:config example-name
style: normal
timeframe: all-time
gitstats:config -->
```

### Generated Paths

Save Paths get auto generated based on naming & Card type. 
Named blocks get saved on their name path. 

| Config type | Output path |
| --- | --- |
| Named block, such as `most-used` | `profile/most-used.svg` |
| Unnamed all-time normal block | `profile/GitStats-MostUsed-normal.svg` |
| Duplicate generated path | GitStats appends `-2`, `-3`, and so on. |


### Display Markers

Named display markers display the card of the corresponding block. 
For example, `<!-- gitstats:display most-used -->` displays the card generated by `<!-- gitstats:config most-used`.
| Marker | Behavior |
| --- | --- |
| `<!-- gitstats:display -->` | Displays all generated cards in config order. |
| `<!-- gitstats:display most-used -->` | Displays only the matching named config block. |

> [!NOTE]
> Display markers should be paired. GitStats rewrites only the content between the markers & it injects only image tags plus spacing. 
Put layout HTML outside the markers.

```md
<div align="center">
<!-- gitstats:display -->
<!-- gitstats:display -->
</div>
```


## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `title` | Automatic | Optional card title override. Defaults to `Most Used Languages` for `all-time`, or `Recent Languages` for numbered timeframes. |
| `style` | `normal` | `normal` renders the full card with a list. `compact` renders a thicker labeled bar. |
| `timeframe` | `all-time` | `all-time` uses GitHub language bytes. A number, such as `8`, uses recent commit changes from that many weeks. |
| `show-values` | `true` | Shows byte or change totals in the normal renderer. Compact always shows percentages only. |
| `grouping` | `true` | Groups the smallest languages into `Other` until the bucket is near 5%. |
| `max-languages` | `10` | Maximum number of displayed entries, including `Other`. Overflow languages are grouped into `Other`. |
| `hide-languages` | `HTML,CSS,JSON` | Comma-separated languages to exclude after loading all detected languages. |
| `include-forks` | `false` | Includes forked repositories. |
| `include-archived` | `false` | Includes archived repositories. |
| `include-profile-repo` | `false` | Includes the `username/username` profile repository. |
| `affiliation` | `owner` | Repository affiliation passed to GitHub. Use `owner,collaborator,organization_member` for broader access. |
| `visibility` | `all` | Repository visibility passed to GitHub. |
| `display-width` | `100%` | Width attribute for this card's generated `<img>` tag inside the managed display section. |
| `display-alt` | Automatic | Alt text for this card's generated `<img>` tag inside the managed display section. |

### Grouping

You are able to choose to group small language sets and dynamically decide how much.
When `grouping: true` - GitStats groups the smallest languages into `Other` until that bucket is close to 5%, preferring a smaller bucket over larger ones.

Using `max-languages` you can set how many languages should be displayed (bar & list) - all remaining get grouped into `Other`.
If grouping is enabled, but the amount is larger than `max-languages` - the lowest remaining entries are also merged into `Other`.


## Examples

Mix `style`, `timeframe`, and the other settings however you want. These four examples are the same configurable viewer with different settings.

### All-Time, Normal

```md
<!-- gitstats:config all-time-normal
style: normal
timeframe: all-time
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/most-used-extended.svg" alt="All-time normal language stats example" />
</p>

### All-Time, Compact

```md
<!-- gitstats:config all-time-compact
style: compact
timeframe: all-time
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/most-used-compact.svg" alt="All-time compact language stats example" />
</p>

### Recent, Normal

```md
<!-- gitstats:config recent-normal
style: normal
timeframe: 8
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/recent-extended.svg" alt="Recent normal language stats example" />
</p>

### Recent, Compact

```md
<!-- gitstats:config recent-compact
style: compact
timeframe: 8
gitstats:config -->
```

<p align="center">
  <img width="100%" src="./examples/recent-compact.svg" alt="Recent compact language stats example" />
</p>

## Action Inputs

README config blocks drive SVG generation. Workflow inputs provide global defaults and automation behavior.

| Input | Default | Description |
| --- | --- | --- |
| `token` | Required | GitHub token used to read repositories, language data, and recent commit data. |
| `username` | Repository owner | GitHub username to generate stats for. |
| `readme-config` | `README.md` | README path containing GitStats config blocks. |
| `commit` | `true` | Commit and push changed generated SVGs and README display updates using the workflow checkout credentials. |
| `max-languages` | `10` | Maximum number of displayed entries, including `Other`. |
| `grouping` | `true` | Group the smallest languages into `Other` until the bucket is near 5%. |
| `hide-languages` | `HTML,CSS,JSON` | Languages to exclude after loading all detected languages. |
| `include-forks` | `false` | Include forked repositories. |
| `include-archived` | `false` | Include archived repositories. |
| `include-profile-repo` | `false` | Include the `username/username` profile repository. |
| `affiliation` | `owner` | Repository affiliation passed to GitHub. |
| `visibility` | `all` | Repository visibility passed to GitHub. |
| `title` | Automatic | Global card title fallback. README config blocks can override it per card. |
| `timeframe` | `all-time` | `all-time` for language bytes, or a number of weeks for recent changes. |
| `style` | `normal` | Rendering style. |
| `show-values` | `true` | Show byte or change totals in the normal renderer. |
| `user-agent` | `GitStats-language-card` | User-Agent used for GitHub API requests. |



## How It Works

1. Lists repositories visible to the token.
2. Filters repositories by owner, forks, archived status, and profile repository settings.
3. Chooses the metric from `timeframe`.
4. For `timeframe: all-time`, reads GitHub language byte totals.
5. For a numbered timeframe, reads commits since that many weeks ago and aggregates changed files by language.
6. Applies `hide-languages`, dynamic grouping, and `max-languages`.
7. Renders one SVG for every README config block.
8. Rewrites the managed README display section with matching image tags and spacing.
9. Commits changed generated SVGs and README display updates when `commit: true`.

## Troubleshooting

> [!IMPORTANT]
> GitHub may cache README images for a short while after the workflow updates the SVG files. If the raw SVG file is correct but the README still shows the old card, wait a bit and refresh later.
> 
### The Workflow Succeeded, but the README Still Shows the Old Card

GitHub caches images rendered inside READMEs. Check the SVG file directly in the repository, for example `profile/most-used.svg`. If that raw file is updated, the workflow worked and the README image cache should catch up after a little while.

### The Workflow Fails With `API Rate Limit Exceeded`

GitStats reads repository, language, and commit data through the GitHub API. Wait until the rate limit resets, then rerun the workflow from the Actions tab. Recent cards can use more requests than all-time cards because they inspect commits and changed files inside the selected timeframe.

### The Card Does Not Use My README Config

Make sure the workflow uses `readme-config: README.md` or leaves that input at its default. Config blocks inside fenced code examples are ignored, so active blocks should live directly in the README body.

### The Workflow Cannot Find a Display Block

Add paired `<!-- gitstats:display -->` markers to your README. GitStats needs those markers to know where it may write the generated image HTML. If you use a named display block, make sure the name matches a named `gitstats:config` block.

## Notes

- All-time numbers are GitHub language byte counts, not lines of code.
- Recent numbers are commit file change counts, usually additions plus deletions. They show activity, not how much code exists in that language.
- SVGs are vector graphics. Use `display-width` to control the generated image width, and use layout HTML outside the display markers for positioning.
- Recent language detection is based on changed file paths and extensions.
- Private repository names and source code are not written to the SVG.
- Generated SVGs are public if committed to a public repository.
- Automatic commits use the workflow `GITHUB_TOKEN` from `actions/checkout`, not the stats token.
- GitStats only rewrites content between paired `gitstats:display` markers. Keep layout HTML outside those markers.

## License

MIT
