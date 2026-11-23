import {
  IconArrowLeft,
  IconArrowsDiagonal,
  IconCheck,
  IconCircleCheck,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconMessageCircle,
  IconPlus,
  IconRobot,
  IconSend,
  IconShare,
  IconSparkles,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-design-prototypes',
  width: 960,
  height: 600,
  alt: 'Design Prototypes in the Root.js CMS: desktop and mobile page concepts for Fernwood Market on a shared canvas, with a pinned team comment and Root AI adding a new comparison component.',
};

const BOX_CARDS = [
  {
    name: 'Root Veg Box',
    price: '$28 / wk',
    detail: 'Carrots, beets, parsnips & radishes',
    bg: '#f2f5ec',
    accent: '#2f6f44',
  },
  {
    name: 'Heirloom Greens',
    price: '$24 / wk',
    detail: 'Little gem, chard & baby kale',
    bg: '#eef4f1',
    accent: '#2b6a58',
  },
  {
    name: 'Chef’s Crate',
    price: '$44 / wk',
    detail: 'Full seasonal harvest + herbs',
    bg: '#f7f3ea',
    accent: '#8c5a2b',
  },
];

/** The Design Prototypes workspace with side-by-side frames, comments, and Root AI. */
export default function DesignPrototypes() {
  return (
    <CmsFrame active="prototypes">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#f6f6f3',
          fontSize: '12px',
        }}
      >
        {/* Board top toolbar. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            height: '42px',
            padding: '0 14px',
            background: '#fff',
            borderBottom: '1px solid var(--cms-border)',
            flex: '0 0 auto',
          }}
        >
          <span className="cms-icon-button">
            <IconArrowLeft size={15} />
          </span>
          <span style={{fontWeight: 600, fontSize: '13px'}}>
            Seasonal box landing
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              marginLeft: '8px',
              padding: '2px',
              borderRadius: '6px',
              background: '#f1f3f5',
            }}
          >
            <span
              style={{
                padding: '3px 9px',
                borderRadius: '4px',
                background: '#fff',
                fontWeight: 600,
                fontSize: '11.5px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              Landing concepts
            </span>
            <span
              style={{
                padding: '3px 9px',
                fontSize: '11.5px',
                color: 'var(--cms-text-muted)',
              }}
            >
              Checkout
            </span>
          </div>

          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="cms-button" style={{height: '26px'}}>
              <IconPlus size={13} />
              Add frame
            </span>
            <span className="cms-button" style={{height: '26px'}}>
              <IconMessageCircle size={13} />2
            </span>
            <span
              className="cms-button cms-button--active"
              style={{height: '26px'}}
            >
              <IconRobot size={13} />
              Root AI
            </span>
            <span className="cms-button" style={{height: '26px'}}>
              <IconShare size={13} />
              Share
            </span>
          </div>
        </div>

        {/* Main canvas + Root AI panel. */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 272px',
            overflow: 'hidden',
          }}
        >
          {/* Dotted artboard canvas. */}
          <div
            style={{
              position: 'relative',
              backgroundImage: 'radial-gradient(#d5d5d0 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              padding: '22px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '20px',
              overflow: 'hidden',
            }}
          >
            {/* Desktop frame. */}
            <div
              style={{width: '396px', flex: '0 0 auto', position: 'relative'}}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                  fontSize: '11px',
                  color: 'var(--cms-text-muted)',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontWeight: 600,
                    color: '#1c7ed6',
                  }}
                >
                  <IconDeviceDesktop size={13} />
                  Desktop concept
                </span>
                <IconArrowsDiagonal size={12} />
              </div>

              <div
                style={{
                  background: '#fff',
                  borderRadius: '10px',
                  border: '1.5px solid #339af0',
                  boxShadow:
                    '0 8px 24px rgba(15, 23, 42, 0.08), 0 0 0 3px rgba(51, 154, 240, 0.1)',
                  overflow: 'hidden',
                }}
              >
                {/* Site nav. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 16px',
                    borderBottom: '1px solid #ecebe6',
                    background: '#fdfcf8',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '11px',
                      letterSpacing: '-0.02em',
                      color: '#1b3b28',
                    }}
                  >
                    FERNWOOD MARKET
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '9.5px',
                      color: '#5c665f',
                    }}
                  >
                    <span>Harvest Boxes</span>
                    <span>Growers</span>
                    <span>Recipes</span>
                  </div>
                </div>

                {/* Hero block. */}
                <div
                  style={{
                    padding: '18px 18px 16px',
                    background:
                      'linear-gradient(135deg, #f4f7ef 0%, #fbf9f2 100%)',
                    borderBottom: '1px solid #ecebe6',
                  }}
                >
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#2f6f44',
                      marginBottom: '5px',
                    }}
                  >
                    Spring Harvest Subscriptions
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 800,
                      lineHeight: 1.15,
                      letterSpacing: '-0.02em',
                      color: '#162b1f',
                      marginBottom: '6px',
                    }}
                  >
                    Farm boxes, picked at dawn.
                  </div>
                  <div
                    style={{
                      fontSize: '10.5px',
                      lineHeight: 1.45,
                      color: '#4c5c52',
                      maxWidth: '280px',
                      marginBottom: '11px',
                    }}
                  >
                    Choose your weekly or bi-weekly harvest from local growers
                    and swap items anytime.
                  </div>
                  <div style={{display: 'flex', gap: '7px'}}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '5px 11px',
                        borderRadius: '6px',
                        background: '#1f5c35',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Build your box
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cfd6cf',
                        background: '#fff',
                        color: '#1f3a29',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      See this week’s crop
                    </span>
                  </div>
                </div>

                {/* Existing component block. */}
                <div style={{padding: '12px 16px 10px'}}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                    }}
                  >
                    {BOX_CARDS.map((card) => (
                      <div
                        style={{
                          padding: '9px',
                          borderRadius: '7px',
                          background: card.bg,
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#1a2e22',
                          }}
                        >
                          {card.name}
                        </div>
                        <div
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 700,
                            color: card.accent,
                            marginTop: '2px',
                          }}
                        >
                          {card.price}
                        </div>
                        <div
                          style={{
                            fontSize: '8.5px',
                            lineHeight: 1.35,
                            color: '#5b6860',
                            marginTop: '4px',
                          }}
                        >
                          {card.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Proposed new component block. */}
                <div style={{padding: '0 16px 14px'}}>
                  <div
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      border: '1.5px dashed #845ef7',
                      background: '#faf8ff',
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: '#1a2e22',
                        }}
                      >
                        Compare delivery plans
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '1px 6px',
                          borderRadius: '999px',
                          background: '#ede9fe',
                          color: '#6741d9',
                          fontSize: '8.5px',
                          fontWeight: 600,
                        }}
                      >
                        <IconSparkles size={9} />
                        New component · BoxComparison
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 9px',
                          borderRadius: '6px',
                          background: '#fff',
                          border: '1px solid #e5e0f7',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 700,
                            color: '#1a2e22',
                          }}
                        >
                          Weekly · $28
                        </div>
                        <div
                          style={{
                            fontSize: '8.5px',
                            color: '#5c665f',
                            marginTop: '2px',
                          }}
                        >
                          8–10 seasonal picks, free swap
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '8px 9px',
                          borderRadius: '6px',
                          background: '#fff',
                          border: '1.5px solid #2f6f44',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 700,
                              color: '#1a2e22',
                            }}
                          >
                            Bi-weekly · $26
                          </span>
                          <span
                            style={{
                              fontSize: '7.5px',
                              fontWeight: 700,
                              color: '#2f6f44',
                              background: '#e6f4ea',
                              padding: '1px 4px',
                              borderRadius: '4px',
                            }}
                          >
                            Popular
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '8.5px',
                            color: '#5c665f',
                            marginTop: '2px',
                          }}
                        >
                          Flexible pause, 10% member credit
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pinned author avatar comment pin + open thread popover. */}
              <div
                style={{
                  position: 'absolute',
                  right: '-218px',
                  bottom: '18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    border: '2px solid #fff',
                    boxShadow:
                      '0 0 0 2px #1c7ed6, 0 4px 10px rgba(15,23,42,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#7950f2',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    flex: '0 0 auto',
                  }}
                >
                  A
                </div>
                <div
                  style={{
                    width: '216px',
                    background: '#fff',
                    borderRadius: '10px',
                    border: '1px solid var(--cms-border)',
                    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.14)',
                    padding: '10px 11px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '5px',
                    }}
                  >
                    <Avatar name="Ada" />
                    <span style={{fontWeight: 600, fontSize: '11px'}}>Ada</span>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--cms-text-muted)',
                      }}
                    >
                      4m ago
                    </span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--cms-text-muted)',
                      }}
                    >
                      <IconCheck size={13} />
                    </span>
                  </div>
                  <div style={{fontSize: '11px', lineHeight: 1.45}}>
                    Love this comparison block—looks ready to convert into a
                    real template.
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile frame beside it. */}
            <div style={{width: '180px', flex: '0 0 auto'}}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '6px',
                  fontSize: '11px',
                  color: 'var(--cms-text-muted)',
                  fontWeight: 500,
                }}
              >
                <IconDeviceMobile size={13} />
                Mobile · 390px
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: '10px',
                  border: '1px solid var(--cms-border)',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #ecebe6',
                    fontWeight: 800,
                    fontSize: '9.5px',
                    color: '#1b3b28',
                    background: '#fdfcf8',
                  }}
                >
                  FERNWOOD MARKET
                </div>
                <div
                  style={{
                    padding: '12px',
                    background: '#f4f7ef',
                    borderBottom: '1px solid #ecebe6',
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      lineHeight: 1.15,
                      color: '#162b1f',
                      marginBottom: '5px',
                    }}
                  >
                    Farm boxes, picked at dawn.
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      lineHeight: 1.4,
                      color: '#4c5c52',
                      marginBottom: '8px',
                    }}
                  >
                    Local weekly or bi-weekly harvests.
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 9px',
                      borderRadius: '5px',
                      background: '#1f5c35',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: 600,
                    }}
                  >
                    Build your box
                  </div>
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {BOX_CARDS.slice(0, 2).map((card) => (
                    <div
                      style={{
                        padding: '7px 8px',
                        borderRadius: '6px',
                        background: card.bg,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          color: '#1a2e22',
                        }}
                      >
                        {card.name} · {card.price}
                      </div>
                      <div style={{fontSize: '8px', color: '#5b6860'}}>
                        {card.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Root AI panel. */}
          <aside
            style={{
              background: '#fff',
              borderLeft: '1px solid var(--cms-border)',
              display: 'flex',
              flexDirection: 'column',
              padding: '12px',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                fontSize: '12.5px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--cms-border)',
              }}
            >
              <IconRobot size={15} />
              Root AI
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--cms-text-muted)',
                  background: '#f1f3f5',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                Design system aware
              </span>
            </div>

            <div
              style={{
                alignSelf: 'flex-end',
                maxWidth: '220px',
                padding: '8px 10px',
                borderRadius: '10px 10px 3px 10px',
                background: '#e7f5ff',
                fontSize: '11px',
                lineHeight: 1.45,
              }}
            >
              Add a 2-tier weekly vs. bi-weekly plan comparison below our box
              grid using Fernwood’s tokens.
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '7px'}}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: '#f8f9fa',
                  border: '1px solid var(--cms-border)',
                  fontSize: '10.5px',
                  color: '#374151',
                }}
              >
                <IconCircleCheck size={13} color="#2f9e44" />
                <span>Read site styles &amp; 14 components</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: '#f8f9fa',
                  border: '1px solid var(--cms-border)',
                  fontSize: '10.5px',
                  color: '#374151',
                }}
              >
                <IconCircleCheck size={13} color="#2f9e44" />
                <span>Added BoxComparison to Desktop</span>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: '#374151',
                  padding: '2px 2px 0',
                }}
              >
                Added a proposed <strong>BoxComparison</strong> block below the
                existing <strong>BoxGrid</strong> using your forest green accent
                and card spacing. Want me to mirror it on the mobile frame too?
              </div>
            </div>

            <div
              style={{
                marginTop: 'auto',
                border: '1px solid var(--cms-border)',
                borderRadius: '8px',
                padding: '8px 9px',
                background: '#fbfbf9',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--cms-text-muted)',
                  marginBottom: '8px',
                }}
              >
                Ask Root AI to iterate…
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--cms-text-muted)',
                    fontFamily: 'var(--cms-font-mono)',
                  }}
                >
                  CLI · root-cms prototypes
                </span>
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: '#222',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconSend size={12} />
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </CmsFrame>
  );
}
