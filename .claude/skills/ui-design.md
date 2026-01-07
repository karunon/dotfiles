# UI/フロントエンドデザインスキル

このスキルは、日本のデジタル庁デザインシステムβ版に準拠したUI/フロントエンドデザインを実装するためのガイドラインを提供します。

**参照**: https://design.digital.go.jp/

## 基本理念

「誰一人取り残されない、人に優しいデジタル化を」

すべてのUI実装において、ユーザビリティとアクセシビリティを最優先に設計・実装してください。

---

## 1. 余白（スペーシング）

### 基準単位

**8 CSS px** を基準単位として使用します。

### スペーシングスケール

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `spacing-1` | 8px | 最小の余白、アイコンとテキストの間隔 |
| `spacing-2` | 16px | 関連要素間の余白 |
| `spacing-3` | 24px | セクション内の要素間 |
| `spacing-4` | 32px | カード内のパディング |
| `spacing-5` | 40px | セクション間の余白 |
| `spacing-6` | 48px | 大きなセクション間 |
| `spacing-8` | 64px | ページセクション間 |

### 余白の使い分け原則

1. **階層構造の表現**
   - 重要な要素には大きな間隔
   - 重要度が低い要素には小さな間隔

2. **関連性の示唆**
   - 関連性の高い要素：小さな余白で視覚的に結びつける
   - 関連性の低い要素：大きな余白で分離

3. **一貫性**
   - プロジェクト全体で3〜5種類のスケールを定義し、一貫して使用

```css
/* CSS変数での定義例 */
:root {
  --spacing-1: 0.5rem;   /* 8px */
  --spacing-2: 1rem;     /* 16px */
  --spacing-3: 1.5rem;   /* 24px */
  --spacing-4: 2rem;     /* 32px */
  --spacing-5: 2.5rem;   /* 40px */
  --spacing-6: 3rem;     /* 48px */
  --spacing-8: 4rem;     /* 64px */
}
```

---

## 2. 角の形状（Corner Shapes）

**参照**: https://design.digital.go.jp/dads/foundations/corner-shapes/

角の形状はコンポーネントの機能理解を促進し、視覚的な抑揚を生み出す設計要素です。

### 5段階の角丸スケール

| スタイル | 正方形 | 長方形 | 用途 |
|---------|--------|--------|------|
| **角丸なし** | 0 | 0 | シャープな印象、フォーマルなデザイン |
| **角丸スモール** | 8px | 8px | 小さなUI要素（ボタン、入力欄、チップ） |
| **角丸ミディアム** | 16px | 12px | 標準的なコンポーネント（カード、パネル） |
| **角丸ラージ** | 32px | 16px | 大きなコンテナ、特徴的なセクション |
| **角丸フル** | 高さの50% | 高さの50% | 完全な丸（アバター、丸ボタン、ピル型） |

> **注意**: 正方形と長方形で異なる数値を使用することで、視覚的な統一感と一貫性を保ちます。

### 角丸の使い分け原則

1. **サイズによる視覚調整**
   - 図形が小さいほど角丸の印象は強く見える
   - 図形が大きいほど角丸の印象は弱く見える
   - 同じスタイルでもコンポーネントサイズに応じて個別調整が必要

2. **強調表現**
   - 角丸の違いで特定の図形を強調できる
   - 周囲と異なる角丸を持つ要素は目立つ

3. **一貫性を保つ**
   - 同じ種類のコンポーネントには同じスタイルを適用
   - プロジェクト全体でスタイルガイドを定義

4. **部分的適用**
   - 用途に応じて特定の角のみに角丸を適用可能
   - 例: タブは上部のみ角丸、ドロップダウンは下部のみ角丸

5. **ネストした角丸の計算**
   - 内側の角丸 = 外側の角丸 - パディング
   - 例: 外側16px、パディング8pxの場合、内側は8px

```css
/* CSS変数での定義例 */
:root {
  /* 正方形用 */
  --radius-none: 0;
  --radius-sm: 0.5rem;    /* 8px */
  --radius-md: 1rem;      /* 16px */
  --radius-lg: 2rem;      /* 32px */
  --radius-full: 50%;

  /* 長方形用（視覚的統一のため小さめ） */
  --radius-rect-sm: 0.5rem;   /* 8px */
  --radius-rect-md: 0.75rem;  /* 12px */
  --radius-rect-lg: 1rem;     /* 16px */
}

/* 使用例 */
.button {
  border-radius: var(--radius-sm);
}

.card {
  border-radius: var(--radius-rect-md);
}

.avatar {
  border-radius: var(--radius-full);
}

/* 部分的適用の例 */
.tab {
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.dropdown-menu {
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
```

---

## 3. カラーシステム

### カラーカテゴリ

#### プライマリカラー
- ブランドアイデンティティを確立
- ロゴ、ヘッダー、CTAボタンに使用
- **コントラスト比**: 背景色と最低 **4.5:1** を確保

#### セカンダリカラー
- プライマリカラーを補完
- 同じ色相で異なる明度を使用
- **コントラスト比**: 隣接要素と最低 **3:1**、テキスト使用時は **4.5:1**

#### ターシャリカラー
- セカンダリと同じ色相で逆の明度
- コントラスト要件はセカンダリと同様

#### コモンカラー（グレースケール）
- 中立的なグレーのスケール
- テキスト、ボーダー、UIコンポーネントに使用
- **テキスト**: 4.5:1のコントラスト必須
- **非テキスト要素（区切り線など）**: 3:1のコントラスト必須

### セマンティックカラー

| 意味 | 色 | 用途 |
|------|-----|------|
| 成功 | 緑系 | 完了メッセージ、成功状態 |
| エラー | 赤系 | エラーメッセージ、必須項目 |
| 警告 | 黄/オレンジ系 | 警告メッセージ、注意喚起 |
| 情報 | 青系 | お知らせ、ヒント |

#### セマンティックカラーのコントラスト比要件

> **重要**: セマンティックカラーは情報を伝える重要な役割を持つため、コントラスト比の確保は必須です。

| 用途 | 最低コントラスト比 | 備考 |
|------|-------------------|------|
| テキスト | **4.5:1** | エラーメッセージ、成功メッセージなど |
| アイコン | **4.5:1** | 状態を示すアイコン（チェックマーク、警告アイコンなど） |
| 背景色と前景色 | **4.5:1** | アラートバナーの背景とテキスト/アイコン |
| ボーダー・区切り線 | **3:1** | 入力欄のエラー状態のボーダーなど |

**注意点**:
- 黄色系の警告色は白背景でコントラストが取りにくいため、濃いオレンジや暗い黄色を使用
- 成功の緑も明るすぎる緑は避け、十分な暗さを確保
- 背景色として使用する場合は、その上に載るテキスト・アイコンとのコントラストを必ず確認

### リンクテキスト

**参照**: https://design.digital.go.jp/dads/foundations/link-text/

リンクは通常のテキストと明確に区別される必要があります。**色だけでなく、下線やその他の視覚的インジケーターを併用**してください。

#### リンクの状態とスタイル

| 状態 | スタイル | 説明 |
|------|---------|------|
| **デフォルト** | 青 + 下線 | 標準的なリンク表示 |
| **ホバー** | 色が明るく変化、下線が太くなる場合も | サイズ変更はレイアウト崩れを防ぐため避ける |
| **アクティブ** | オレンジ色 | クリック中の状態 |
| **フォーカス** | 黒のアウトライン + 黄色の背景 | キーボードナビゲーション用 |
| **訪問済み** | 紫/マゼンタ | ブラウザ標準の訪問済み色 |

#### リンクカラーの原則

- **未訪問**: 青（伝統的なリンク色、GoogleやMicrosoftも採用）
- **訪問済み**: 紫/マゼンタ
- ブランドカラーに合わせて青以外を使用する場合は、アクセシビリティに特に注意
- サイト全体で一貫した色を使用
- 色覚多様性（1型・2型色覚）に配慮し、彩度を調整

#### 外部リンクと特殊なリンク

```html
<!-- 外部リンク（新しいタブで開く） -->
<a href="https://example.com" target="_blank" rel="noopener">
  外部サイト
  <span class="external-icon" aria-label="新しいタブを開きます">
    <svg aria-hidden="true">...</svg>
  </span>
</a>

<!-- ファイルダウンロード -->
<a href="/files/document.pdf" download>
  資料をダウンロード（PDF, 2.5MB）
  <span class="file-icon" aria-hidden="true">...</span>
</a>
```

#### リンクのスタイル実装例

```css
a {
  color: var(--color-link);
  text-decoration: underline;
}

a:visited {
  color: var(--color-link-visited);
}

a:hover {
  color: var(--color-link-hover);
  /* サイズ変更は避ける（レイアウト崩れ防止） */
}

a:active {
  color: var(--color-link-active);
}

a:focus {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  background-color: var(--color-focus-bg);
}

/* 外部リンクアイコン */
.external-icon {
  text-decoration: none;
  margin-left: 0.25em;
}
```

### コントラスト比の確認

```javascript
// コントラスト比の計算（WCAG準拠）
function getContrastRatio(color1, color2) {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

---

## 4. タイポグラフィ

### フォントファミリー

```css
:root {
  --font-sans: "Noto Sans JP", sans-serif;
  --font-mono: "Noto Sans Mono", monospace;
}
```

### フォントウェイト

| トークン | 値 | 用途 |
|---------|-----|------|
| Normal (N) | 400 | 本文テキスト |
| Bold (B) | 700 | 見出し、強調 |

### フォントサイズ

| サイズ | 用途 | 注意 |
|--------|------|------|
| 48-64px | インパクトのあるビジュアル要素 | ヒーローセクションなど |
| 16-45px | 見出し・本文 | 16pxが標準最小サイズ |
| 14px | フッターなど制約のある領域 | これより小さいサイズは禁止 |

### 行間（Line Height）

| 値 | 用途 |
|-----|------|
| 100% | 単一行UIコンポーネント（ボタン） |
| 120-130% | 情報密度の高い画面（管理画面） |
| 140% | やや大きめの見出し |
| 150-160% | 標準的なWebの本文（150%が最小推奨） |
| 170-175% | 認知負荷を軽減した本文 |

### テキストスタイルのトークン命名規則

`[カテゴリ]-[サイズ][ウェイト]-[行間]`

例: `Std-17N-170` = Standard、17px、Normal、170%

### テキストスタイルカテゴリ

1. **Display (Dsp)**: 高インパクトなビジュアルメッセージ
2. **Standard (Std)**: 文書構造・見出し
3. **Dense (Dns)**: 情報密度の高いインターフェース
4. **Oneline (Oln)**: 単一行UI要素
5. **Mono**: コードコンテンツ

```css
/* タイポグラフィトークンの例 */
:root {
  /* Display */
  --text-dsp-48b-120: 700 3rem/1.2 var(--font-sans);

  /* Standard */
  --text-std-24b-140: 700 1.5rem/1.4 var(--font-sans);
  --text-std-17n-170: 400 1.0625rem/1.7 var(--font-sans);
  --text-std-16n-160: 400 1rem/1.6 var(--font-sans);

  /* Dense */
  --text-dns-14n-130: 400 0.875rem/1.3 var(--font-sans);

  /* Oneline */
  --text-oln-16n-100: 400 1rem/1 var(--font-sans);

  /* Mono */
  --text-mono-14n-150: 400 0.875rem/1.5 var(--font-mono);
}
```

---

## 5. レイアウト

**参照**: https://design.digital.go.jp/dads/foundations/layout/

レイアウトは明確な情報伝達を実現するための技術です。

### グリッドシステム

**12カラムグリッド**を標準として採用しています。12は柔軟な分割・組み合わせが可能です。

#### グリッド構成要素

| 要素 | 説明 |
|------|------|
| **マージン** | グリッド全体の外側の余白 |
| **カラム** | コンテンツを配置する領域（本文サイズの整数倍） |
| **ガター** | カラム間の余白（本文サイズの2倍を基本とする） |
| **ナビゲーション領域** | 固定幅または可変幅のサイドメニュー |

### ブレークポイント

| デバイス | ビューポート幅 |
|---------|---------------|
| **モバイル・タブレット** | 768px未満 |
| **デスクトップ** | 768px以上 |

> タブレット専用のブレークポイントを追加することも可能です。

### カラムレイアウトパターン

| パターン | 用途 |
|---------|------|
| **1カラム** | フルワイドコンテンツ、記事ページ |
| **2カラム** | メインコンテンツ + サイドバー |
| **3カラム** | ダッシュボード、複雑な情報表示 |
| **4カラム** | ギャラリー、商品一覧 |
| **カラムオフセット** | 読み物向け中央配置コンテンツ |

```css
/* グリッドシステムの実装例 */
:root {
  --grid-columns: 12;
  --grid-gutter: 1.5rem;  /* 24px（本文16pxの1.5倍） */
  --container-max-width: 1200px;
  --container-padding: 1rem;
}

.container {
  max-width: var(--container-max-width);
  margin: 0 auto;
  padding: 0 var(--container-padding);
}

.grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), 1fr);
  gap: var(--grid-gutter);
}

/* レスポンシブ対応 */
@media (max-width: 767px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

/* カラムスパン */
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
.col-3 { grid-column: span 3; }
```

---

## 6. エレベーション（高さ・影）

**参照**: https://design.digital.go.jp/dads/foundations/elevation/

エレベーションはブラウザ上で表示されるコンポーネントの高さの度合いを示します。

### 基本概念

- **レベル0**: 基準面（デフォルト、エレベーションなし）
- コンポーネントのレベルが高いほど、背景面から浮いて見える
- ドロップシャドウで視覚的な高さを表現

### エレベーションの使用原則

1. **最小限の使用**
   - 階層構造がUIの理解を本当に助ける場合のみ使用
   - 過度な影の使用は視覚的ノイズになる

2. **相対的な位置関係**
   - エレベーションレベルは下にあるコンポーネントに対して相対的
   - モーダル内では内部の階層がリセットされる

3. **コントラスト要件**
   - 要素は背景と3:1以上のコントラスト比を確保
   - **ドロップシャドウだけではアクセシビリティ要件を満たせない**

### 状態別のエレベーション

| 状態 | エレベーション | 説明 |
|------|--------------|------|
| **静止状態** | レベル0〜1 | 通常のカード、パネル |
| **ホバー状態** | 静止+1以上 | インタラクティブフィードバック |
| **オーバーレイ** | レベル2以上 | モーダル、ドロップダウン |

### エレベーションギャップの選択

| ギャップ | 推奨用途 |
|---------|---------|
| **広いギャップ** | ゆとりのあるインターフェース、強い視覚的強調 |
| **狭いギャップ** | 情報密度の高いシステム、管理画面 |

### ドロップシャドウの実装例

```css
:root {
  /* 8段階のシャドウスタイル */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-2: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-3: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
  --shadow-4: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
  --shadow-5: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
  --shadow-6: 0 25px 50px rgba(0, 0, 0, 0.15);

  /* オーバーレイシェード */
  --overlay-bg: rgba(0, 0, 0, 0.5);
}

/* 使用例 */
.card {
  box-shadow: var(--shadow-2);
}

.card:hover {
  box-shadow: var(--shadow-4);
}

.modal {
  box-shadow: var(--shadow-6);
}

.modal-overlay {
  background-color: var(--overlay-bg);
}
```

### 特殊なケース

- **3Dコンポーネント**: 土台がレベル0、表面がレベル1
- **オーバーレイシェード**: 活性化時に内部の階層をレベル0にリセット

---

## 7. アクセシビリティ（a11y）

### 準拠規格

- **WCAG 2.2**（最新版）
- **WCAG 2.1** / **WCAG 2.0**（JIS X 8341-3:2016互換）
- **WAI-ARIA 1.2 / 1.3**
- **ARIA Authoring Practices Guide (APG)**

### アイコンのコントラスト比について（重要）

> **極めて重要**: アイコンは「非テキストコンテンツ」として扱われることが多いですが、**意味を伝えるアイコンはテキストと同等のコントラスト比 4.5:1 を確保してください**。

#### なぜ4.5:1が必要か

WCAG 2.1では非テキスト要素（UIコンポーネントやグラフィックオブジェクト）に3:1を求めていますが、以下の理由からアイコンには4.5:1を推奨します：

1. **アイコンは情報伝達の主要手段になりうる**
   - 「成功」「エラー」「警告」などの状態表示
   - ナビゲーションの視覚的手がかり
   - アクションの意味を示すボタンアイコン

2. **テキストの代替として機能する場合がある**
   - アイコンのみのボタン（ハンバーガーメニュー、閉じるボタンなど）
   - テキストラベルの補助としてのアイコン

3. **低視力ユーザーへの配慮**
   - 小さなアイコンは認識しにくいため、より高いコントラストが必要

#### アイコンのコントラスト比ルール

| アイコンの種類 | 最低コントラスト比 | 例 |
|--------------|-------------------|-----|
| 意味を伝えるアイコン | **4.5:1** | 状態アイコン、ナビアイコン、アクションアイコン |
| 装飾的アイコン | 要件なし | 純粋に装飾目的のもの（ただし`aria-hidden="true"`を付与） |
| 大きなアイコン（24px以上） | **3:1** | ヒーローセクションの大きなアイコン |

```css
/* アイコンカラーの定義例 */
:root {
  /* 4.5:1以上を確保したアイコンカラー */
  --icon-primary: #1a1a1a;      /* 黒に近いグレー */
  --icon-success: #0d7a3e;      /* 暗めの緑 */
  --icon-error: #c41e3a;        /* 暗めの赤 */
  --icon-warning: #8b6914;      /* 暗めのオレンジ/黄色 */
  --icon-info: #0055a5;         /* 暗めの青 */
  --icon-disabled: #767676;     /* 4.5:1ギリギリのグレー */
}
```

### 必須チェック項目

#### 色とコントラスト
- [ ] テキストのコントラスト比 4.5:1 以上
- [ ] **意味を伝えるアイコンのコントラスト比 4.5:1 以上**
- [ ] 大きなテキスト（18pt以上または14pt太字以上）は 3:1 以上
- [ ] 非テキスト要素（ボーダー、区切り線など）のコントラスト比 3:1 以上
- [ ] 色だけで情報を伝えない（形状やテキストも併用）

#### キーボード操作
- [ ] すべての機能がキーボードで操作可能
- [ ] フォーカスインジケーターが視認可能
- [ ] フォーカス順序が論理的
- [ ] キーボードトラップがない

#### インタラクティブ要素
- [ ] タッチターゲットサイズ 44x44px 以上推奨
- [ ] クリック/タップ領域が十分な大きさ
- [ ] ホバー・フォーカス・アクティブ状態が明確

#### モーション
- [ ] `prefers-reduced-motion` を尊重
- [ ] 自動再生アニメーションに停止手段を提供
- [ ] 点滅コンテンツは3回/秒以下

#### レスポンシブデザイン
- [ ] 400%ズームでもコンテンツが利用可能
- [ ] 横スクロールなしで読める（320px幅まで）
- [ ] テキストリサイズに対応

### ARIA実装のベストプラクティス

```html
<!-- ボタン例 -->
<button type="button" aria-label="メニューを開く">
  <svg aria-hidden="true">...</svg>
</button>

<!-- モーダル例 -->
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">確認</h2>
  ...
</div>

<!-- ライブリージョン例 -->
<div role="status" aria-live="polite">
  保存しました
</div>
```

### reduced-motionの実装

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. コンポーネント設計ガイドライン（アクセシビリティ重視）

**参照**: https://design.digital.go.jp/dads/components/

本デザインシステムでは、アクセシビリティの確保を最優先とし、用途を想起しやすく情報設計がやりやすいコンポーネントを提供します。

### 8.1 ボタン

**参照**: WCAG 1.4.1 色の使用（レベルA）

#### アクセシビリティ要件

| 要件 | 詳細 |
|------|------|
| タッチターゲット | 最低 **44×44 CSS px** を確保 |
| 視覚的階層 | 色だけでなく、塗り/アウトライン/テキストで区別 |
| キーボード操作 | Tab でフォーカス、Enter/Space で実行 |
| フォーカス表示 | 明確なフォーカスインジケーター |

#### disabled状態を避ける（重要）

> **警告**: `disabled`属性を使用したボタンは**タブフォーカスが当たらなくなる**ため、ユーザーはなぜボタンが押せないのか理解できません。

**推奨アプローチ**:
- ボタンを無効化する代わりに、必要なアクションを明確に表示
- ユーザーが不完全な状態で送信しようとした場合、エラーメッセージで何を完了すべきか案内

```html
<!-- 非推奨: disabled属性 -->
<button disabled>送信</button>

<!-- 推奨: 常にクリック可能にし、バリデーションで対応 -->
<button type="submit">送信</button>
<!-- クリック時にエラーがあれば表示 -->
<div role="alert" class="error-message">
  必須項目を入力してください
</div>
```

#### ボタンの視覚的階層

```css
/* プライマリ（塗り） */
.btn-primary {
  background-color: var(--color-primary);
  color: white;
  border: none;
}

/* セカンダリ（アウトライン） */
.btn-secondary {
  background-color: transparent;
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

/* ターシャリ（テキストのみ） */
.btn-tertiary {
  background-color: transparent;
  color: var(--color-primary);
  border: none;
  text-decoration: underline;
}
```

---

### 8.2 フォーム要素

#### 共通アクセシビリティ要件

| 要素 | 要件 |
|------|------|
| **ラベル** | 入力欄の上に左揃えで配置、`<label>`で関連付け |
| **必須表示** | 「※必須」を赤文字でラベル後ろに配置 |
| **サポートテキスト** | 入力のヒントやエラーメッセージを表示 |
| **エラー状態** | 色だけでなくアイコンやテキストで伝達 |

#### インプットテキスト・テキストエリア

```html
<div class="form-field">
  <label for="email">
    メールアドレス
    <span class="required">※必須</span>
  </label>
  <p id="email-hint" class="hint">例: example@example.com</p>
  <input
    type="email"
    id="email"
    name="email"
    aria-describedby="email-hint email-error"
    aria-invalid="false"
    required
  />
  <p id="email-error" class="error" role="alert" hidden>
    有効なメールアドレスを入力してください
  </p>
</div>
```

#### チェックボックス・ラジオボタン

> **重要**: チェックボックス・ラジオボタンは**テキストの左側**に配置してください。画面を拡大表示しているユーザーでも見つけやすくなります。

```html
<!-- チェックボックスグループ -->
<fieldset>
  <legend>お知らせの受信方法（複数選択可）</legend>
  <div class="checkbox-group">
    <input type="checkbox" id="notify-email" name="notify" value="email" />
    <label for="notify-email">メール</label>
  </div>
  <div class="checkbox-group">
    <input type="checkbox" id="notify-sms" name="notify" value="sms" />
    <label for="notify-sms">SMS</label>
  </div>
</fieldset>

<!-- ラジオボタングループ -->
<fieldset>
  <legend>お支払い方法</legend>
  <div class="radio-group">
    <input type="radio" id="pay-card" name="payment" value="card" />
    <label for="pay-card">クレジットカード</label>
  </div>
  <div class="radio-group">
    <input type="radio" id="pay-bank" name="payment" value="bank" />
    <label for="pay-bank">銀行振込</label>
  </div>
  <!-- ラジオボタンは選択解除できないため、任意項目には「該当なし」を用意 -->
  <div class="radio-group">
    <input type="radio" id="pay-none" name="payment" value="none" />
    <label for="pay-none">未定</label>
  </div>
</fieldset>
```

#### セレクトボックス

- OSデフォルトのスタイルを使用（カスタムドロップダウンはa11y問題を起こしやすい）
- ラベルは入力欄の上に左揃え
- 必須/任意を明示

```html
<div class="form-field">
  <label for="prefecture">
    都道府県
    <span class="required">※必須</span>
  </label>
  <select id="prefecture" name="prefecture" required>
    <option value="">選択してください</option>
    <option value="tokyo">東京都</option>
    <option value="osaka">大阪府</option>
    <!-- ... -->
  </select>
</div>
```

---

### 8.3 通知・バナー

**参照**: WCAG 1.4.1 色の使用（レベルA）

#### コントラスト要件

| 要素 | 最低コントラスト比 |
|------|-------------------|
| テキスト | **4.5:1** |
| アイコン・ボーダー | **3:1** |

#### 実装ガイドライン

1. **色だけに頼らない**: セマンティックタイプ（成功/エラー/警告/情報）にはアイコンを併用
2. **配置**: ファーストビュー（スクロール不要な位置）に表示
3. **閉じるボタン**: 閉じた状態を永続化し、再表示しない（ただし復元手段を提供）

```html
<!-- 通知バナー -->
<div role="alert" class="notification notification--warning">
  <svg class="notification__icon" aria-hidden="true">
    <!-- 警告アイコン -->
  </svg>
  <div class="notification__content">
    <p class="notification__title">システムメンテナンスのお知らせ</p>
    <p class="notification__message">
      2024年1月15日 2:00〜6:00 の間、サービスを停止します。
    </p>
  </div>
  <button
    type="button"
    class="notification__close"
    aria-label="通知を閉じる"
  >
    <svg aria-hidden="true"><!-- 閉じるアイコン --></svg>
  </button>
</div>
```

#### ARIA Live Regions

動的に表示される通知には`role="alert"`または`aria-live`を使用：

```html
<!-- 即座に読み上げ（重要な通知） -->
<div role="alert">エラーが発生しました</div>

<!-- 現在の読み上げ完了後に通知（補足情報） -->
<div role="status" aria-live="polite">保存しました</div>
```

---

### 8.4 ナビゲーション

#### パンくずリスト

```html
<nav aria-label="パンくずリスト">
  <ol class="breadcrumb">
    <li class="breadcrumb__item">
      <a href="/">ホーム</a>
    </li>
    <li class="breadcrumb__item">
      <a href="/services">サービス</a>
    </li>
    <li class="breadcrumb__item" aria-current="page">
      申請手続き
    </li>
  </ol>
</nav>
```

#### グローバルナビゲーション

```html
<nav aria-label="メインナビゲーション">
  <ul class="nav-menu" role="menubar">
    <li role="none">
      <a href="/" role="menuitem">ホーム</a>
    </li>
    <li role="none">
      <button
        role="menuitem"
        aria-haspopup="true"
        aria-expanded="false"
      >
        サービス
      </button>
      <ul role="menu" hidden>
        <li role="none">
          <a href="/service-a" role="menuitem">サービスA</a>
        </li>
        <!-- ... -->
      </ul>
    </li>
  </ul>
</nav>
```

---

### 8.5 モーダルダイアログ

#### フォーカス管理（重要）

1. **開いた時**: ダイアログ内の最初のフォーカス可能な要素にフォーカス
2. **閉じた時**: ダイアログを開いたトリガー要素にフォーカスを戻す
3. **フォーカストラップ**: ダイアログ内でフォーカスを循環させる

```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-desc"
>
  <h2 id="dialog-title">確認</h2>
  <p id="dialog-desc">この操作を実行しますか？</p>
  <div class="dialog-actions">
    <button type="button" class="btn-secondary">キャンセル</button>
    <button type="button" class="btn-primary">実行</button>
  </div>
</div>
<div class="dialog-overlay" aria-hidden="true"></div>
```

```javascript
// フォーカストラップの実装例
function trapFocus(dialog) {
  const focusableElements = dialog.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === 'Escape') {
      closeDialog();
    }
  });
}
```

---

### 8.6 テーブル

#### アクセシビリティ要件

```html
<table>
  <caption>2024年度予算一覧</caption>
  <thead>
    <tr>
      <th scope="col">項目</th>
      <th scope="col">予算額</th>
      <th scope="col">執行額</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">人件費</th>
      <td>1,000万円</td>
      <td>950万円</td>
    </tr>
    <!-- ... -->
  </tbody>
</table>
```

#### 複雑なテーブル

```html
<!-- headers属性で複雑なヘッダー関係を明示 -->
<table>
  <caption>部署別・四半期別売上</caption>
  <thead>
    <tr>
      <th id="dept" rowspan="2">部署</th>
      <th id="q1" colspan="2">第1四半期</th>
      <th id="q2" colspan="2">第2四半期</th>
    </tr>
    <tr>
      <th id="q1-target" headers="q1">目標</th>
      <th id="q1-actual" headers="q1">実績</th>
      <th id="q2-target" headers="q2">目標</th>
      <th id="q2-actual" headers="q2">実績</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th id="sales" headers="dept">営業部</th>
      <td headers="sales q1 q1-target">100</td>
      <td headers="sales q1 q1-actual">120</td>
      <td headers="sales q2 q2-target">110</td>
      <td headers="sales q2 q2-actual">105</td>
    </tr>
  </tbody>
</table>
```

---

### 8.7 コンポーネント実装の基本原則

1. **セマンティックHTML優先**
   - 適切なHTML要素を使用（`<button>`, `<a>`, `<nav>`, `<main>`など）
   - ARIAは補助として使用（HTMLで表現できない場合のみ）

2. **キーボード操作**
   - すべてのインタラクティブ要素がTabでフォーカス可能
   - 論理的なフォーカス順序
   - Escapeでモーダル/ドロップダウンを閉じる

3. **フォーカス表示**
   - `focus-visible`で明確なフォーカスインジケーター
   - 黄色背景 + 黒アウトラインが推奨

4. **状態の明確化**
   - hover, focus, active, disabled状態を視覚的に区別
   - `aria-expanded`, `aria-selected`, `aria-current`で状態を伝達

5. **エラーハンドリング**
   - `role="alert"`でエラーを即座に通知
   - エラーメッセージを`aria-describedby`で関連付け

```css
/* フォーカス表示の実装例 */
:focus-visible {
  outline: 2px solid #000;
  outline-offset: 2px;
  background-color: #ffeb3b;
}
```

---

## 9. 実装チェックリスト

### 開発前
- [ ] デザイントークン（色、余白、タイポグラフィ）を定義
- [ ] アクセシビリティ要件を確認

### 開発中
- [ ] セマンティックHTMLを使用
- [ ] キーボードナビゲーションをテスト
- [ ] コントラスト比をチェック
- [ ] レスポンシブ対応を確認

### 開発後
- [ ] スクリーンリーダーでテスト
- [ ] axe-coreやLighthouseでアクセシビリティ監査
- [ ] 各ブラウザ・デバイスで動作確認

---

## 参考リンク

- [デジタル庁デザインシステム](https://design.digital.go.jp/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
