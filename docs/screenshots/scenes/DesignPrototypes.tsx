import {
  IconArrowLeft,
  IconArrowsDiagonal,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconDotsVertical,
  IconFrame,
  IconHandStop,
  IconMaximize,
  IconMessageCircle,
  IconMessagePlus,
  IconMinus,
  IconNote,
  IconPlus,
  IconPointer,
  IconRobot,
  IconSend,
  IconShare,
  IconSparkles,
  IconX,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-design-prototypes',
  width: 960,
  height: 600,
  alt: 'Design Prototypes in the Root.js CMS: desktop and mobile page concepts for Fernwood Market on a shared artboard, with floating canvas tools, a team comment, and the floating Root AI card.',
};

const BOX_CARDS = [
  {
    name: 'Root Veg Box',
    price: '$28 / wk',
    detail: 'Carrots, beets & radishes',
    bg: '#f2f5ec',
    accent: '#2f6f44',
  },
  {
    name: 'Heirloom Greens',
    price: '$24 / wk',
    detail: 'Little gem, chard & kale',
    bg: '#eef4f1',
    accent: '#2b6a58',
  },
  {
    name: 'Chef’s Crate',
    price: '$44 / wk',
    detail: 'Full harvest + herbs',
    bg: '#f7f3ea',
    accent: '#8c5a2b',
  },
];

/**
 * The Design Prototypes workspace: full-bleed dotted artboard with floating
 * top-left/top-right HUD pills, bottom-center tool dock, and floating Root AI
 * card.
 */
export default function DesignPrototypes() {
  return (
    <CmsFrame active="prototypes">
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          backgroundColor: '#f5f5f2',
          backgroundImage: 'radial-gradient(#d4d4cf 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          overflow: 'hidden',
          fontSize: '12px',
        }}
      >
        {/* Top-left floating board & page switcher pill. */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '34px',
            padding: '0 8px',
            borderRadius: '10px',
            border: '1px solid var(--cms-border)',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.07)',
          }}
        >
          <span className="cms-icon-button">
            <IconArrowLeft size={14} />
          </span>
          <span style={{fontWeight: 600, fontSize: '12.5px'}}>
            Seasonal box landing
          </span>
          <span
            style={{
              width: '1px',
              height: '16px',
              background: 'var(--cms-border)',
              margin: '0 2px',
            }}
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 7px',
              borderRadius: '6px',
              background: '#f5f5f3',
              fontSize: '11.5px',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Landing concepts
            <IconChevronDown size={12} color="#6b7280" />
          </span>
          <span className="cms-icon-button">
            <IconDotsVertical size={13} />
          </span>
        </div>

        {/* Top-right floating actions & panel toggles pill. */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            height: '34px',
            padding: '0 6px',
            borderRadius: '10px',
            border: '1px solid var(--cms-border)',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.07)',
          }}
        >
          <span className="cms-button" style={{height: '24px', border: 'none'}}>
            <IconMessageCircle size={13} />2
          </span>
          <span
            className="cms-button cms-button--active"
            style={{height: '24px'}}
          >
            <IconRobot size={13} />
            Root AI
          </span>
          <span
            style={{
              width: '1px',
              height: '16px',
              background: 'var(--cms-border)',
              margin: '0 2px',
            }}
          />
          <span className="cms-button" style={{height: '24px'}}>
            <IconShare size={13} />
            Share
          </span>
        </div>

        {/* Artboard frames on the dotted canvas. */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '20px',
          }}
        >
          {/* Desktop frame. */}
          <div style={{width: '384px', flex: '0 0 auto', position: 'relative'}}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
                padding: '0 2px',
                fontSize: '11px',
                color: 'var(--cms-text-muted)',
              }}
            >
              <span style={{fontWeight: 600, color: '#1c7ed6'}}>
                Desktop concept
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <IconArrowsDiagonal size={12} />
                <IconDotsVertical size={12} />
              </span>
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
                  padding: '8px 15px',
                  borderBottom: '1px solid #ecebe6',
                  background: '#fdfcf8',
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '10.5px',
                    letterSpacing: '-0.02em',
                    color: '#1b3b28',
                  }}
                >
                  FERNWOOD MARKET
                </span>
                <div
                  style={{
                    display: 'flex',
                    gap: '11px',
                    fontSize: '9px',
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
                  padding: '16px 16px 14px',
                  background:
                    'linear-gradient(135deg, #f4f7ef 0%, #fbf9f2 100%)',
                  borderBottom: '1px solid #ecebe6',
                }}
              >
                <div
                  style={{
                    fontSize: '8.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#2f6f44',
                    marginBottom: '4px',
                  }}
                >
                  Spring Harvest Subscriptions
                </div>
                <div
                  style={{
                    fontSize: '17px',
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    color: '#162b1f',
                    marginBottom: '5px',
                  }}
                >
                  Farm boxes, picked at dawn.
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    lineHeight: 1.45,
                    color: '#4c5c52',
                    maxWidth: '270px',
                    marginBottom: '10px',
                  }}
                >
                  Choose your weekly or bi-weekly harvest from local growers and
                  swap items anytime.
                </div>
                <div style={{display: 'flex', gap: '6px'}}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: '#1f5c35',
                      color: '#fff',
                      fontSize: '9.5px',
                      fontWeight: 600,
                    }}
                  >
                    Build your box
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: '1px solid #cfd6cf',
                      background: '#fff',
                      color: '#1f3a29',
                      fontSize: '9.5px',
                      fontWeight: 600,
                    }}
                  >
                    See this week’s crop
                  </span>
                </div>
              </div>

              {/* Existing site component block. */}
              <div style={{padding: '10px 14px 9px'}}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '7px',
                  }}
                >
                  {BOX_CARDS.map((card) => (
                    <div
                      style={{
                        padding: '8px',
                        borderRadius: '7px',
                        background: card.bg,
                        border: '1px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          color: '#1a2e22',
                        }}
                      >
                        {card.name}
                      </div>
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: card.accent,
                          marginTop: '2px',
                        }}
                      >
                        {card.price}
                      </div>
                      <div
                        style={{
                          fontSize: '8px',
                          lineHeight: 1.35,
                          color: '#5b6860',
                          marginTop: '3px',
                        }}
                      >
                        {card.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proposed new component block. */}
              <div style={{padding: '0 14px 12px'}}>
                <div
                  style={{
                    borderRadius: '8px',
                    border: '1.5px dashed #845ef7',
                    background: '#faf8ff',
                    padding: '9px 11px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '7px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
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
                        fontSize: '8px',
                        fontWeight: 600,
                      }}
                    >
                      <IconSparkles size={9} />
                      New · BoxComparison
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '7px',
                    }}
                  >
                    <div
                      style={{
                        padding: '7px 8px',
                        borderRadius: '6px',
                        background: '#fff',
                        border: '1px solid #e5e0f7',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: '#1a2e22',
                        }}
                      >
                        Weekly · $28
                      </div>
                      <div
                        style={{
                          fontSize: '8px',
                          color: '#5c665f',
                          marginTop: '2px',
                        }}
                      >
                        8–10 picks, free swap
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '7px 8px',
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
                            fontSize: '9px',
                            fontWeight: 700,
                            color: '#1a2e22',
                          }}
                        >
                          Bi-weekly · $26
                        </span>
                        <span
                          style={{
                            fontSize: '7px',
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
                          fontSize: '8px',
                          color: '#5c665f',
                          marginTop: '2px',
                        }}
                      >
                        Flexible pause, 10% credit
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Author avatar comment pin + open popover. */}
            <div
              style={{
                position: 'absolute',
                right: '-216px',
                bottom: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                zIndex: 10,
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
                  width: '214px',
                  background: '#fff',
                  borderRadius: '10px',
                  border: '1px solid var(--cms-border)',
                  boxShadow: '0 10px 26px rgba(15, 23, 42, 0.14)',
                  padding: '9px 10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
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
                <div
                  style={{
                    fontSize: '11px',
                    lineHeight: 1.4,
                    marginBottom: '7px',
                  }}
                >
                  Love this comparison block—looks ready to convert into a real
                  template.
                </div>
                <div
                  style={{
                    position: 'relative',
                    border: '1px solid var(--cms-border)',
                    borderRadius: '6px',
                    padding: '5px 26px 5px 8px',
                    fontSize: '10.5px',
                    color: 'var(--cms-text-muted)',
                  }}
                >
                  Reply…
                  <span
                    style={{
                      position: 'absolute',
                      right: '4px',
                      bottom: '3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#e5e7eb',
                      color: '#6b7280',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconSend size={10} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile frame beside desktop. */}
          <div style={{width: '176px', flex: '0 0 auto'}}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
                padding: '0 2px',
                fontSize: '11px',
                color: 'var(--cms-text-muted)',
                fontWeight: 500,
              }}
            >
              <span>Mobile concept</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <IconArrowsDiagonal size={12} />
                <IconDotsVertical size={12} />
              </span>
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
                  padding: '8px 11px',
                  borderBottom: '1px solid #ecebe6',
                  fontWeight: 800,
                  fontSize: '9px',
                  color: '#1b3b28',
                  background: '#fdfcf8',
                }}
              >
                FERNWOOD MARKET
              </div>
              <div
                style={{
                  padding: '11px',
                  background: '#f4f7ef',
                  borderBottom: '1px solid #ecebe6',
                }}
              >
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 800,
                    lineHeight: 1.15,
                    color: '#162b1f',
                    marginBottom: '4px',
                  }}
                >
                  Farm boxes, picked at dawn.
                </div>
                <div
                  style={{
                    fontSize: '8.5px',
                    lineHeight: 1.4,
                    color: '#4c5c52',
                    marginBottom: '7px',
                  }}
                >
                  Local weekly or bi-weekly harvests.
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    background: '#1f5c35',
                    color: '#fff',
                    fontSize: '8.5px',
                    fontWeight: 600,
                  }}
                >
                  Build your box
                </div>
              </div>
              <div
                style={{
                  padding: '9px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {BOX_CARDS.slice(0, 2).map((card) => (
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: card.bg,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '9px',
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

        {/* Bottom-center floating tools & zoom dock. */}
        <div
          style={{
            position: 'absolute',
            left: '316px',
            bottom: '12px',
            transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            height: '36px',
            padding: '0 6px',
            borderRadius: '11px',
            border: '1px solid var(--cms-border)',
            background: '#fff',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.1)',
          }}
        >
          <span
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: '#e7f5ff',
              color: '#1c7ed6',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconPointer size={14} />
          </span>
          <span className="cms-icon-button">
            <IconHandStop size={14} />
          </span>
          <span className="cms-icon-button">
            <IconMessageCircle size={14} />
          </span>
          <span className="cms-icon-button">
            <IconNote size={14} />
          </span>
          <span className="cms-icon-button">
            <IconFrame size={14} />
          </span>
          <span
            style={{
              width: '1px',
              height: '16px',
              background: 'var(--cms-border)',
              margin: '0 3px',
            }}
          />
          <span className="cms-icon-button">
            <IconMinus size={13} />
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#374151',
              padding: '0 3px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            75%
          </span>
          <span className="cms-icon-button">
            <IconPlus size={13} />
          </span>
          <span className="cms-icon-button">
            <IconMaximize size={13} />
          </span>
        </div>

        {/* Floating Root AI card (top-14 right-3 bottom-3). */}
        <aside
          style={{
            position: 'absolute',
            top: '56px',
            right: '12px',
            bottom: '12px',
            width: '266px',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            border: '1px solid var(--cms-border)',
            background: '#fff',
            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Floating card header. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 12px',
              borderBottom: '1px solid var(--cms-border)',
            }}
          >
            <IconRobot size={15} />
            <span style={{fontWeight: 600, fontSize: '12.5px'}}>Root AI</span>
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span className="cms-icon-button">
                <IconMessagePlus size={14} />
              </span>
              <span className="cms-icon-button">
                <IconX size={14} />
              </span>
            </div>
          </div>

          {/* Messages. */}
          <div
            style={{
              flex: 1,
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                alignSelf: 'flex-end',
                maxWidth: '216px',
                padding: '8px 10px',
                borderRadius: '10px 10px 3px 10px',
                background: '#e7f5ff',
                fontSize: '11px',
                lineHeight: 1.45,
              }}
            >
              Add a 2-tier weekly vs. bi-weekly plan comparison below our box
              grid using Fernwood’s styles.
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
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
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#f8f9fa',
                  border: '1px solid var(--cms-border)',
                  fontSize: '10.5px',
                  color: '#374151',
                }}
              >
                <IconCircleCheck size={13} color="#2f9e44" />
                <span>Updated Desktop concept</span>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: '#374151',
                  padding: '2px 2px 0',
                }}
              >
                Added a proposed <strong>BoxComparison</strong> block below{' '}
                <strong>BoxGrid</strong> using your forest green accent and card
                spacing. Want me to mirror it on the mobile frame too?
              </div>
            </div>
          </div>

          {/* Composer with model selector pill inside. */}
          <div style={{padding: '10px'}}>
            <div
              style={{
                border: '1px solid var(--cms-border)',
                borderRadius: '10px',
                padding: '8px 9px 7px',
                background: '#fbfbf9',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--cms-text-muted)',
                  marginBottom: '10px',
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 7px',
                    borderRadius: '999px',
                    background: '#efefef',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Gemini 2.5 Pro
                  <IconChevronDown size={11} />
                </span>
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#222',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconSend size={11} />
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </CmsFrame>
  );
}
