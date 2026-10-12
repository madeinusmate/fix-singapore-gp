import { createElement as h } from 'react'

const box = (style, ...children) => h('div', {
  style: { display: 'flex', ...style },
}, ...children)

const flag = () => {
  const cells = []
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      cells.push(h('div', {
        key: `${x}-${y}`,
        style: {
          width: 10,
          height: 10,
          background: (x + y) % 2 === 0 ? '#f4f4f6' : '#15151e',
        },
      }))
    }
  }
  return box({
    flexWrap: 'wrap',
    width: 40,
    height: 20,
    transform: 'skewX(-12deg)',
  }, cells)
}

const watermark = () => {
  const cells = []
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      cells.push(h('div', {
        key: `${x}-${y}`,
        style: {
          width: 42,
          height: 42,
          background: (x + y) % 2 === 0 ? '#f4f4f6' : '#0b0b10',
        },
      }))
    }
  }
  return box({
    position: 'absolute',
    right: 64,
    bottom: 78,
    flexWrap: 'wrap',
    width: 252,
    height: 210,
    opacity: 0.14,
    transform: 'skewX(-12deg)',
  }, cells)
}

const logo = (weight, italic) => box({ alignItems: 'center' },
  flag(),
  box({
    marginLeft: 16,
    fontSize: 26,
    fontWeight: weight(900),
    fontStyle: italic,
    letterSpacing: 2,
  }, 'FIX SINGAPORE GP'),
)

const layoutPoster = (model, weight, italic, family) => box({
  width: 1200,
  height: 630,
  background: '#0b0b10',
  color: '#f4f4f6',
  fontFamily: family,
  position: 'relative',
},
  h('img', {
    src: model.imageUrl,
    width: 1200,
    height: 630,
    style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' },
  }),
  box({
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1200,
    height: 630,
    backgroundImage: 'linear-gradient(to top, rgba(11,11,16,0.9) 0%, rgba(11,11,16,0.08) 48%, rgba(11,11,16,0.62) 100%)',
  }),
  box({
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1200,
    height: 618,
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '40px 48px 32px',
  },
    logo(weight, italic),
    box({
      width: 1080,
      fontSize: model.title.length > 32 ? 48 : 64,
      fontWeight: weight(900),
      fontStyle: italic,
      lineHeight: 1.02,
    }, model.title),
  ),
  box({ position: 'absolute', bottom: 0, left: 0, width: 1200, height: 12, background: '#e10600' }),
)

export const ogCard = (model, branded = true) => {
  const weight = (value) => (branded ? value : 400)
  const italic = branded ? 'italic' : 'normal'
  if (model.kind === 'layout' && model.imageUrl) return layoutPoster(model, weight, italic, branded ? 'Titillium Web' : 'geist')
  const titleSize = model.title.length > 36 ? 58 : 72
  const score = typeof model.score === 'number' ? model.score.toFixed(2) : ''

  return box({
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    background: '#0b0b10',
    color: '#e8e8ee',
    fontFamily: branded ? 'Titillium Web' : 'geist',
    position: 'relative',
  },
    box({ flex: 1, width: '100%' },
      box({
        width: 1200,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 60px 44px',
      },
        logo(weight, italic),
        box({ flexDirection: 'column', width: 1040 },
          box({
            color: '#e10600',
            fontSize: 22,
            fontWeight: weight(700),
            letterSpacing: 3,
            textTransform: 'uppercase',
            marginBottom: 16,
          }, model.kicker),
          box({
            fontSize: titleSize,
            fontWeight: weight(900),
            fontStyle: italic,
            lineHeight: 0.98,
            textTransform: model.kind === 'layout' ? 'none' : 'uppercase',
          }, model.title),
          model.accent ? box({
            marginTop: 6,
            color: '#e10600',
            fontSize: titleSize,
            fontWeight: weight(900),
            fontStyle: italic,
            lineHeight: 0.98,
            textTransform: 'uppercase',
          }, model.accent) : null,
          box({
            marginTop: 22,
            color: '#c8c8d0',
            fontSize: 30,
            fontWeight: weight(400),
            lineHeight: 1.3,
          }, model.detail),
        ),
        score ? box({
          alignSelf: 'flex-start',
          flexDirection: 'column',
          background: '#14141c',
          borderLeft: '8px solid #ffb800',
          padding: '12px 22px 16px',
        },
          box({
            color: '#ffb800',
            fontSize: 16,
            fontWeight: weight(700),
            letterSpacing: 2,
          }, 'OVERTAKING INDEX'),
          box({
            marginTop: 2,
            fontSize: 56,
            fontWeight: weight(900),
            fontStyle: italic,
            lineHeight: 1,
          }, score),
        ) : box({}),
      ),
    ),
    watermark(),
    box({ height: 12, width: '100%', background: '#e10600' }),
  )
}
