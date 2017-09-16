const express = require('express')
const path = require('path')
const app = express()
const logger = require('morgan')
const fs = require('fs')
const opn = require('opn')
const proxy = require('http-proxy-middleware')


const __webdir =  path.join(__dirname, '../build')
const __mockPath = 'mock'

app.use(logger('dev'));

/**
 * 反向代理
 * 这里可以配置哪些url走服务器接口, 哪些走本地mock, 或者伙伴的机器
 */
function proxyFunc(req, res, next) {
    // 参考: https://github.com/chimurai/http-proxy-middleware
    delete require.cache[require.resolve('./proxy-list.js')];
    return proxy({
        // target: 'http://127.0.0.1:3001', // 这里是要反向代理的api域名
        target: 'http://localhost:3018', // 这里是要反向代理的api域名
        changeOrigin: true,
        // toProxy: false,
        // prependPath: false,
        // ignorePath: true,
        pathRewrite: require('./proxy-list.js').pathRewrite, // 这个模式比较好, 能动态配置, js文件内可以写注释
        router: require('./proxy-list.js').router,
        onError(err, req2, res2) {
            res2.writeHead(500, {
                'Content-Type': 'application/json'
            });
            const json = { code: 444, msg: '反向代理错误, 有可能是代理的域名不能访问' }
            // res2.json(json) // 这样发送回报错
            res2.end(JSON.stringify(json))
        }
    })(req, res, next)
}

app.use('/api', function(req, res, next) {
    console.log('req.headers.host: ', req.headers.host)
    console.log('req.headers.referer: ', req.headers.referer)
    console.log('req.headers.origin: ', req.headers.origin)
    // console.log('req: ', req)
    if (!req.headers.origin) {
        console.log('使用反向代理(浏览器直接访问接口url): ', req.url)
        proxyFunc(req, res, next)
    } else if (req.headers.origin.indexOf(req.headers.host) >= 0) {
        console.log('使用反向代理(接口和宿主url域名一致): ', req.url)
        proxyFunc(req, res, next)
    } else {
        console.log('使用反向代理(接口和页面域名不一致): ', req.url)
        proxyFunc(req, res, next)
        // console.log('跳过反向代理: ', req.url)
        // next()
    }
})


app.use(function (req, res, next) {
    // 能夠重写成功
    if (req.url.indexOf('.') === -1 &&
        req.url.indexOf('__webpack_hmr') === -1 &&
        req.url.indexOf('/mock/') === -1 // mock数据
        ) {
        console.log('重定向的url:', req.url)
        req.url = '/index.html'
    } else {
        console.log('没有重定向的url:', req.url)
    }
    next();
    //404后处理, 要编译成本地文件才行
    // res.hasOwnProperty('statusCode') 这个能判断是否url处理成功
    if (!res.hasOwnProperty('statusCode') && !res.finished) {
        console.log('404捕获参数: ', res.hasOwnProperty('statusCode'), res.statusCode, res.finished, ' url:', req.url)
        if (req.url.indexOf('/dist/dll/') === 0 ||
            req.url.indexOf('/font/iconfont/') === 0
        ) {
            try {
                const filename = path.join(__webdir, req.url)
                if (fs.existsSync(filename)) {
                    const doc = fs.readFileSync(filename, 'utf8')
                    res.send(doc)
                    console.log(`发送重定向文件: ${filename}`)
                }
            } catch (err) {
                console.error('\r\n\r\n error: server-dev.js', err)
            }
        }
    } else {
        console.log('200捕获参数: ', res.hasOwnProperty('statusCode'), res.statusCode, res.finished, ' url:', req.url)
    }
})


var staticPath = path.posix.join('/', 'static')
console.log('staticPath:', staticPath)
app.use('/static', express.static('./build/static'))
app.use('/', express.static('./build/public'))
app.listen(3030, function () {
  console.log('Server listening on http://localhost:3030, Ctrl+C to stop')
  console.log('http://127.0.0.1:3030/config  里可以管理mock数据')
//   opn('http://localhost:3030/static/test.html')
  opn('http://localhost:3030/api/com/ogoodo/cxb-test.do?a=b&c=123')
})

function getFullFilename(url) {
    return path.join(__webdir, url)
}
// function getMockFilename(req) {
//     let filename = path.join(__webdir, req.originalUrl)
//     if(filename.indexOf('?') > 0) {
//         filename = filename.substr(0, filename.indexOf('?'))
//     }
//     return filename
// }
function proxyInfo(req) {
    let url = req.originalUrl
    if(url.indexOf('?') > 0) {
        url = url.substr(0, url.indexOf('?'))
    }
    console.log('================', url)

    let fn0 = url

    let fn2 = url.replace('/', '')
    fn2 = fn2.replace(/\//g, '.')

    let fn3 = url.replace('/mock/', '')
    fn3 = fn3.replace(/\//g, '.')
    fn3 = path.join(__mockPath, fn3)

    let fn8 = url.substr(url.lastIndexOf('/') + 1, 999999)
    fn8 = path.join(__mockPath, fn8)

    const info = {
        urlProxy: `[${req.method}]${req.headers.host}${req.originalUrl}`,
        urlOriginal: req.originalUrl,
        urlNoArgument: url,
        // filename: getMockFilename(req),
        files: [
            getFullFilename(fn0),
            getFullFilename(fn2),
            getFullFilename(fn3),
            getFullFilename(fn8),
        ]
    }
    console.log('判断文件是否存在==={{')
    for(let i = 0; i < info.files.length; i++) {
        if (fs.existsSync(info.files[i])) {
            info.file = info.files[i]
            console.log('文件存在:', info.files[i])
            break
        } else {
            console.log('文件不存在:', info.files[i])
        }
    }
    console.log('判断文件是否存在===}}')
    return info
}
function sendProxyError(req, res, msg) {
    res.writeHead(500, {
        'Content-Type': 'application/json'
    });
    const json = {
        code: 444,
        msg: msg || '反向代理错误',
        __proxyMsg__: proxyInfo(req),
    }
    // res2.json(json) // 这样发送回报错
    res.end(JSON.stringify(json))
}
/**
 * 发送接口数据
 */
function sendProxyApi(req, res, next) {
    console.log(`进入app.use('/mack')分支(${req.method}): ${req.url}`)
    const info = proxyInfo(req)
    const filename = info.file; // getMockFilename(req)
    if (!filename || !fs.existsSync(filename)) {
        console.log(`无mock文件: ${filename}`)
        sendProxyError(req, res, '本地mock文件没有')
        return;
    }
    try {
        console.log(`读取文件:${filename}`)

        // delete require.cache[require.resolve(filename)];
        // const jjj = require(filename);
        // console.log('jjj:', jjj);
        let doc = fs.readFileSync(filename, 'utf8')
        // res.setHeader('Content-Type', 'application/json')
        res.contentType('application/json')
        // res.json({ file2:12 })
        console.log(`内容转换为json`)
        // doc = doc.replace(/\\n/g, "\\n")
        // .replace(/\\'/g, "\\'")
        // .replace(/\\"/g, '\\"')
        // .replace(/\\&/g, "\\&")
        // .replace(/\\r/g, "\\r")
        // .replace(/\\t/g, "\\t")
        // .replace(/\\b/g, "\\b")
        // .replace(/\\f/g, "\\f");
        // remove non-printable and other non-valid JSON chars
        // doc = doc.replace(/[\u0000-\u0019]+/g,"");
        const json = JSON.parse(doc)
        // const json = eval(doc)
        json.__proxyMsg__ = proxyInfo(req)
        res.json(json)
        console.log(`发送重定向mock文件: ${filename}`)
        console.log(`发送重定向mock内容: ${doc}`)
        return true;
    } catch (err) {
        console.error('\r\n\r\n error: server-dev.js', err)
        sendProxyError(req, res, err)
    }
    return false;
    // res.end()
}

const appApiA = express()
appApiA.use(logger('dev-api11'));
appApiA.use('/mock/', function(req, res, next) {
    console.log('DEV-API11访问的url: ', req.url)
    const b = sendProxyApi(req, res, next)
    if (!b) {
        // next()
    }
})
appApiA.use(function(req, res, next) {
    sendProxyError(req, res, '本地mock反向代理转发过来的path要以/mock开头')
})
appApiA.listen(3011, function () {
  console.log('API Server listening on http://localhost:3011, Ctrl+C to stop')
})

const appApiB = express()
appApiB.use(logger('dev-api12'));
appApiB.use('/mock/', function(req, res, next) {
    console.log('DEV-API12访问的url: ', req.url)
    const b = sendProxyApi(req, res, next)
    if (!b) {
        // next()
    }
})
appApiB.use(function(req, res, next) {
    sendProxyError(req, res, '本地mock反向代理转发过来的path要以/mock开头')
})
appApiB.listen(3012, function () {
  console.log('API Server listening on http://localhost:3011, Ctrl+C to stop')
})

