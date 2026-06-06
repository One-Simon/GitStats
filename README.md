<table>
  <tr>
    <td width="45%">
      <h1>Hi, I´m Simon</h1>
    </td>
    <td width="55%" align="right">
      <a href="https://github.com/DenverCoder1/readme-typing-svg">
        <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=26&duration=3200&pause=900&color=36BCF7&center=false&vCenter=true&width=500&lines=GitStats;Configurable+language+cards;README-driven%2C+clean%2C+and+easy+to+tune" alt="Typing SVG" />
      </a>
    </td>
  </tr>
</table>

GitStats is set of fully configurable language breakdown Cards for your Github Profile.

I didn´t like the functionality, nor the flexibility of existing projects. Hope you enjoy :)

## What it is

- README-driven config | `gitstats:config`blocks allow easy configurability.
- Managed display | Paired `gitstats:display` markers auto generate Cards.
- Flexible timeframe | Use `all-time` language bytes or a recent weeks.
- Two styles | `normal` extended bar & list. `compact` labeled bar.
- Language cleanup | Hide languages, group entries into `Other`, and fully configure visibility.

  <br>
<p align="center">
  <img width="80%" src="./examples/most-used-extended.svg" alt="GitStats normal language example" />
</p>

<p align="center">
  <img width="80%" src="./examples/recent-compact.svg" alt="Recent compact language stats example" />
</p>






<br>
<br>

## Quick Setup

### 1. Add the Workflow

Add this workflow to the repository where the Cards should be displayed.  
For a GitHub profile README, that is usually `YOUR_USERNAME/YOUR_USERNAME`.

GitStats is published as a reusable GitHub Action.  
the workflow decides when the action runs and grants write permission to the current repository.  
GitStats reads README config blocks, generates Cards & updates managed display sections automatically.  

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

<br>  

### 2. Add Config Blocks in README

Add a Config Block inside the README for each Card.  
Each Card can have a set of [settings](#settings) that let you customize them extensively.  

Almost all of them are optional. Only set the values you want to change.   
This is the minimal necessary setup:
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


<br>

### 3. Add a Display Section

GitStats displays the Cards between the markers with generated image tags.  
You do not need to add SVG paths or `<img>` tags yourself.  
The surrounding `<div>` is yours,  you can center the cards, place them in a table, or use any other README layout GitHub supports.  

```md
<div align="center">
<!-- gitstats:display -->
<!-- gitstats:display -->
</div>
```

<br>

> [!TIP]
> You can also display the Cards seperate from one another and show them wherever you like.

For this, name the Configuration blocks however you like: 
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

The block names become the Card names.  
These examples generate `profile/allTime.svg` and `profile/recent.svg`.  

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


<br>

### 4. Optional: Add a Typing Header

You can add a dynamic typing banner to the top of your profile README with [DenverCoder1/readme-typing-svg](https://github.com/DenverCoder1/readme-typing-svg).

Copy this block near the top of your README:

```md
<p align="center">
  <a href="https://github.com/DenverCoder1/readme-typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=28&duration=3200&pause=900&color=36BCF7&center=true&vCenter=true&width=720&lines=Hi%2C+I%27m+YOUR_NAME;I+build+developer+tools;I+like+clean+README+automation" alt="Typing SVG" />
  </a>
</p>
```

Set what it displays by editing the `lines` parameter:

```text
lines=First+line;Second+line;Third+line
```

- Separate lines with `;`.
- Replace spaces with `+` or `%20`.
- Encode special characters such as commas, apostrophes, and ampersands. The easiest way is to use the [demo builder](https://readme-typing-svg.demolab.com/demo/), then copy the generated URL.
- Increase `width` if the longest line gets clipped.
- Change `color` with a hex value without `#`, such as `36BCF7` or `58A6FF`.
- Change `font`, `size`, `duration`, and `pause` to tune the style and speed.
- Keep `center=true&vCenter=true` when placing it in a centered profile header.

<br>

### 5. Token Setup

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

<br>

> [!IMPORTANT]
> GitStats does not receive access to the Code inside your repositories, only to the Metadata. 


<br>

### 6. Run Once

Run the Workflow / Action once from the Actions tab.  
After the first successful run, the generated Cards will be committed and displayed in your README.

> [!TIP]
> To change a card later, edit the matching `gitstats:config` block and rerun the workflow. 

> [!WARNING]
> DO NOT eidt the generated content between display markers.





<br>

## Settings

<details open>
<summary><h3>Basic Settings</h3></summary>

These are the settings you will most likely change first.

<table align="center">
  <tr>
    <th>Setting</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>title</code></td>
    <td>Automatic</td>
    <td>Optional card title override. Defaults to <code>Most Used Languages</code> for <code>all-time</code>, or <code>Recent Languages</code> for numbered timeframes.</td>
  </tr>
  <tr>
    <td><code>timeframe</code></td>
    <td><code>all-time</code></td>
    <td><code>all-time</code> uses GitHub language bytes. A number, such as <code>8</code>, uses recent commit changes from that many weeks.</td>
  </tr>
  <tr>
    <td><code>style</code></td>
    <td><code>normal</code></td>
    <td><code>normal</code> renders the full card with a list. <code>compact</code> renders a thicker labeled bar.</td>
  </tr>
</table>

</details>

<details open>
<summary><h3>Styling Settings</h3></summary>

These settings change how each generated card is rendered or displayed in your README.

<table align="center">
  <tr>
    <th>Setting</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>show-values</code></td>
    <td><code>true</code></td>
    <td>Shows byte or change totals in the normal renderer. Compact cards always show percentages only.</td>
  </tr>
  <tr>
    <td><code>display-width</code></td>
    <td><code>100%</code></td>
    <td>Width attribute for this card's generated <code>&lt;img&gt;</code> tag inside the managed display section.</td>
  </tr>
  <tr>
    <td><code>display-alt</code></td>
    <td>Automatic</td>
    <td>Alt text for this card's generated <code>&lt;img&gt;</code> tag inside the managed display section.</td>
  </tr>
</table>

</details>

<details>
<summary><h3>Language Settings</h3></summary>

These settings control which languages appear and how smaller entries are handled.

<table align="center">
  <tr>
    <th>Setting</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>hide-languages</code></td>
    <td><code>HTML,CSS,JSON</code></td>
    <td>Comma-separated languages to exclude after loading all detected languages.</td>
  </tr>
  <tr>
    <td><code>grouping</code></td>
    <td><code>true</code></td>
    <td>Groups the smallest languages into <code>Other</code> until the bucket is near 5%.</td>
  </tr>
  <tr>
    <td><code>max-languages</code></td>
    <td><code>10</code></td>
    <td>Maximum number of displayed entries, including <code>Other</code>. Overflow languages are grouped into <code>Other</code>.</td>
  </tr>
</table>

</details>

<details>
<summary><h3>Repository Settings</h3></summary>

These settings control which repositories GitStats reads from GitHub.

<table align="center">
  <tr>
    <th>Setting</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>include-forks</code></td>
    <td><code>false</code></td>
    <td>Includes forked repositories.</td>
  </tr>
  <tr>
    <td><code>include-archived</code></td>
    <td><code>false</code></td>
    <td>Includes archived repositories.</td>
  </tr>
  <tr>
    <td><code>include-profile-repo</code></td>
    <td><code>false</code></td>
    <td>Includes the <code>username/username</code> profile repository.</td>
  </tr>
  <tr>
    <td><code>affiliation</code></td>
    <td><code>owner</code></td>
    <td>Repository affiliation passed to GitHub. Use <code>owner,collaborator,organization_member</code> for broader access.</td>
  </tr>
  <tr>
    <td><code>visibility</code></td>
    <td><code>all</code></td>
    <td>Repository visibility passed to GitHub.</td>
  </tr>
</table>

</details>






<br>
<br>

## Grouping

You are able to choose to group small language sets and dynamically decide how much.  
When `grouping: true` - GitStats groups the smallest languages into `Other` until that bucket is close to 5%, preferring a smaller bucket over larger ones.  

Using `max-languages` you can set how many languages should be displayed (bar & list) - all remaining get grouped into `Other`.  
If grouping is enabled, but the amount is larger than `max-languages` - the lowest remaining entries are also merged into `Other`.  





<br>

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

<br>

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

<br>

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

<br>

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






<br>
<br>

## Action Inputs

README config blocks drive Card generation.  
Workflow inputs provide global defaults and automation behavior.  

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





<br>

## How It Works

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
<table align="center">
  <tr>
    <th>Config type</th>
    <th>Output path</th>
  </tr>
  <tr>
    <td>Named block, such as <code>most-used</code></td>
    <td><code>profile/most-used.svg</code></td>
  </tr>
  <tr>
    <td>Unnamed all-time normal block</td>
    <td><code>profile/GitStats-MostUsed-normal.svg</code></td>
  </tr>
  <tr>
    <td>Duplicate generated path</td>
    <td>GitStats appends <code>-2</code>, <code>-3</code>, and so on.</td>
  </tr>
</table>

<br>

### Display Markers

Named display markers display the card of the corresponding block.  
For example, `<!-- gitstats:display most-used -->` displays the card generated by `<!-- gitstats:config most-used`.
<table align="center">
  <tr>
    <th>Marker</th>
    <th>Behavior</th>
  </tr>
  <tr>
    <td><code>&lt;!-- gitstats:display --&gt;</code></td>
    <td>Displays all generated cards in config order.</td>
  </tr>
  <tr>
    <td><code>&lt;!-- gitstats:display most-used --&gt;</code></td>
    <td>Displays only the matching named config block.</td>
  </tr>
</table>

<br>

> [!NOTE]
> Display markers should be paired, not used alone.
> GitStats rewrites only the content between the markers.

> [!WARNING]
> Only image tags & image width get injected. To adjust the width, use the `display-width:` [setting](#settings)  
> Layout HTML has to be OUTSIDE the markers - use the injected Cards however you like.

```md
<div align="center">
<!-- gitstats:display -->
<!-- gitstats:display -->
</div>
```

<br>

### Generation Flow

1. Reads repository metadata visible to the token.
2. Filters repositories by owner, forks, archived status, and profile repository settings.
3. For `timeframe: [weeks` - reads Number of recent changes
4. For `timeframe: all-time` - reads GitHub language byte totals.
5. Applies `hide-languages`, dynamic grouping, and `max-languages`.
6. Renders one SVG for every README config block.
7. Rewrites the marked README display section with matching image tags and spacing.
8. Auto Commits changed generated SVGs and README display updates when.






<br>
<br>

## Troubleshooting

> [!IMPORTANT]
> GitHub may cache README images for a short while after the workflow updates the SVG files. If the raw SVG file is correct but the README still shows the old card, wait a bit and refresh later.

<br>

### The Workflow Succeeded, but the README Still Shows the Old Card  

GitHub caches images rendered inside READMEs. Check the SVG file directly in the repository, for example `profile/most-used.svg`. If that raw file is updated, the workflow worked and the README image cache should catch up after a little while.

<br>

### The Workflow Fails With `API Rate Limit Exceeded`

GitStats reads repository, language, and commit data through the GitHub API. Wait until the rate limit resets, then rerun the workflow from the Actions tab. Recent cards can use more requests than all-time cards because they inspect commits and changed files inside the selected timeframe.

<br>

### The Card Does Not Use My README Config

Make sure the workflow uses `readme-config: README.md` or leaves that input at its default. Config blocks inside fenced code examples are ignored, so active blocks should live directly in the README body.

<br>

### The Workflow Cannot Find a Display Block

Add paired `<!-- gitstats:display -->` markers to your README. GitStats needs those markers to know where it may write the generated image HTML. If you use a named display block, make sure the name matches a named `gitstats:config` block.






<br>
<br>

## Notes

- All-time numbers are GitHub language byte counts, not lines of code.
- Recent numbers are commit file change counts, usually additions plus deletions. They show activity, not how much code exists in that language.
- SVGs are vector graphics. Use `display-width` to control the generated image width, and use layout HTML outside the display markers for positioning.
- Recent language detection is based on changed file paths and extensions.
- Private repository names and source code are not written to the SVG.
- Generated SVGs are public if committed to a public repository.
- Automatic commits use the workflow `GITHUB_TOKEN` from `actions/checkout`, not the stats token.





<br>

## License

MIT
