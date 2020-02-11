/**
 * markdown解析器
 * @author yutent<yutent@doui.cc>
 * @date 2020/02/07 17:14:19
 */

'use strict'
const HR_LIST = ['=', '-', '_', '*']
const LIST_REG = /^(([\+\-\*])|(\d+\.))\s/
const TODO_REG = /^\-\s\[(x|\s)\]\s/
const ESCAPE_REG = /\\([-+*_`])/g
const log = console.log

const Helper = {
  // 是否分割线
  isHr(str) {
    var s = str[0]
    if (HR_LIST.includes(s)) {
      return str.startsWith(s.repeat(3))
    }
    return false
  },
  // 是否列表, -1不是, 1为有序列表, 0为无序列表
  isList(str) {
    var v = str.trim()
    if (LIST_REG.test(v)) {
      var n = +v[0]
      if (n === n) {
        return 1
      } else {
        return 0
      }
    }
    return -1
  },
  // 是否任务列表
  isTodo(str) {
    var v = str.trim()
    if (TODO_REG.test(v)) {
      return v[3] === 'x' ? 1 : 0
    }
    return -1
  },
  ltrim(str) {
    if (str.trimStart) {
      return str.trimStart()
    }
    return str.replace(/^\s+/, '')
  }
}

class Tool {
  constructor(list) {
    this.list = list
  }
  // 初始化字符串, 处理多余换行等
  static init(str) {
    // 去掉\r, 将\t转为空格(2个)
    str = str
      .replace(/\r\n|\r/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\u00a0/g, ' ')
      .replace(/\u2424/g, '\n')
    var list = []
    var lines = str.split('\n')
    var isCodeBlock = false // 是否代码块
    var emptyLineLength = 0 //连续空行的数量

    for (let it of lines) {
      let tmp = it.trim()
      // 空行
      if (!tmp) {
        if (list.length === 0 || (!isCodeBlock && emptyLineLength > 0)) {
          continue
        }
        emptyLineLength++
        list.push(tmp)
      } else {
        emptyLineLength = 0
        if (tmp.startsWith('```')) {
          if (isCodeBlock) {
            list.push('</wc-code>')
          } else {
            list.push(tmp.replace(/^```([\w\#\-]*?)$/, '<wc-code lang="$1">'))
          }
          isCodeBlock = !isCodeBlock
        } else {
          list.push(it)
        }
      }
    }

    return new this(list)
  }

  parse() {
    var html = ''
    var isCodeBlock = false // 是否代码块
    var emptyLineLength = 0 //连续空行的数量
    var isBlockquote = false
    var blockquoteLevel = 0
    var isParagraph = false

    var isList = false
    var orderListLevel = -1
    var unorderListLevel = -1

    //
    for (let it of this.list) {
      // 空行
      if (!it) {
        // 如果是在代码中, 直接拼接, 并加上换行
        if (isCodeBlock) {
          html += it + '\n'
        } else {
          emptyLineLength++

          // 引用结束
          if (isBlockquote) {
            isBlockquote = false
            if (emptyLineLength > 0) {
              emptyLineLength = 0
              while (blockquoteLevel > 0) {
                blockquoteLevel--
                html += '</blockquote>'
              }
            }
            continue
          }

          if (isList) {
            while (orderListLevel > -1 || unorderListLevel > -1) {
              if (orderListLevel > unorderListLevel) {
                html += '</ol>'
                orderListLevel--
              } else {
                html += '</ul>'
                unorderListLevel--
              }
            }
            isList = false
            continue
          }

          //
          if (isParagraph) {
            isParagraph = false
            html += '</p>'
          }
        }
      } else {
        // wc-code标签直接拼接
        if (~it.indexOf('wc-code')) {
          html += it
          isCodeBlock = !isCodeBlock
        } else {
          // 同上代码块的处理
          if (isCodeBlock) {
            html += it + '\n'
            continue
          }

          // 无属性标签
          if (Helper.isHr(it)) {
            html += '<fieldset class="md-hr"><legend></legend></fieldset>'
            continue
          }

          // 优先处理一些常规样式
          it = it
            .replace(/`(.*?[^\\])`/g, '<code class="inline">$1</code>')
            .replace(/(__|\*\*)(.*?[^\\])\1/g, '<strong>$2</strong>')
            .replace(/\b(_|\*)(.*?[^\\])\1\b/g, '<em>$2</em>')
            .replace(/~~(.*?[^\\])~~/g, '<del>$1</del>')
            .replace(/\!\[([^]*?)\]\(([^)]*?)\)/g, '<img src="$2" alt="$1">')
            .replace(/\[([^]*?)\]\(([^)]*?)\)/g, '<a href="$2">$1</a>')
            .replace(ESCAPE_REG, '$1') // 处理转义字符

          // 引用
          if (it.startsWith('>')) {
            if (isBlockquote) {
              html += '<br>'
            }
            html += it.replace(/^(>+) /, (p, m) => {
              let len = m.length
              let tmp = ''
              let loop = len
              // 若之前已经有一个未闭合的引用, 需要减去已有缩进级别, 避免产生新的引用标签
              if (isBlockquote) {
                loop = len - blockquoteLevel
              } else {
              }

              while (loop > 0) {
                loop--
                tmp += '<blockquote class="md-quote">'
              }

              blockquoteLevel = len
              return tmp
            })

            isParagraph = false
            isBlockquote = true
            continue
          }

          if (isBlockquote) {
            html += it
            continue
          }

          // 标题只能是单行
          if (it.startsWith('#')) {
            isParagraph = false

            html += it.replace(/^(#{1,6}) (.*)/, (p, m1, m2) => {
              m2 = m2.trim()
              let level = m1.trim().length
              let hash = m2.replace(/\s/g, '').replace(/<\/?[^>]*?>/g, '')

              if (level === 1) {
                return `<h1>${m2}</h1>`
              } else {
                return `<h${level}><a href="#${hash}" class="md-head-link">${m2}</a></h${level}>`
              }
            })

            continue
          }

          // 任务
          let todoChecked = Helper.isTodo(it)
          if (~todoChecked) {
            let word = it.replace(TODO_REG, '').trim()
            let stat = todoChecked === 1 ? 'checked' : ''
            let txt = todoChecked === 1 ? `<del>${word}</del>` : word

            html += `<section><wc-checkbox readonly ${stat}>${txt}</wc-checkbox></section>`
            continue
          }

          // 列表
          let listChecked = Helper.isList(it)
          if (~listChecked) {
            // 左侧空格长度
            let tmp = Helper.ltrim(it)
            let ltrim = it.length - tmp.length
            let word = tmp.replace(LIST_REG, '').trim()
            let level = Math.floor(ltrim / 2)
            let tag = listChecked > 0 ? 'ol' : 'ul'

            if (!isList) {
              html += `<${tag}>`
              if (listChecked === 1) {
                orderListLevel = level
              } else {
                unorderListLevel = level
              }
              html += `<li>${word}</li>`
            } else {
              if (listChecked === 1) {
                if (level > orderListLevel) {
                  html = html.replace(/<\/li>$/, '')
                  html += `<${tag}><li>${word}</li>`
                } else if (level === orderListLevel) {
                  html += `<li>${word}</li>`
                } else {
                  html += `</${tag}></li><li>${word}</li>`
                }
                orderListLevel = level
              } else {
                if (level > unorderListLevel) {
                  html = html.replace(/<\/li>$/, '')
                  html += `<${tag}><li>${word}</li>`
                } else if (level === unorderListLevel) {
                  html += `<li>${word}</li>`
                } else {
                  html += `</${tag}></li><li>${word}</li>`
                }
                unorderListLevel = level
              }
            }

            isList = true
            continue
          }

          // log('it => ', isParagraph, it)
          if (isParagraph) {
            html += `${it}<br>`
          } else {
            html += `<p>${it}<br>`
          }
          isParagraph = true
        }
      }
    }
    return html
  }
}

export default function(str) {
  return Tool.init(str).parse()
}
