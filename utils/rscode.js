/**
 * Reed-Solomon 编解码器
 * 移植自 http://gyu.que.jp/private/jsfsk/ 的 rscode.js
 * 基于 CCSDS 标准，Phil Karn KA9Q 的实现
 * NN=255, NROOTS=32, 可纠正 16 字节错误
 */

var NN = 255;
var NROOTS = 32;

// CCSDS alpha_to 查找表 (GF(2^8) 元素表示)
var CCSDS_alpha_to = [
  0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x87,0x89,0x95,0xAD,0xDD,0x3D,0x7A,0xF4,
  0x6F,0xDE,0x3B,0x76,0xEC,0x5F,0xBE,0xFB,0x71,0xE2,0x43,0x86,0x8B,0x91,0xA5,0xCD,
  0x1D,0x3A,0x74,0xE8,0x57,0xAE,0xDB,0x31,0x62,0xC4,0x0F,0x1E,0x3C,0x78,0xF0,0x67,
  0xCE,0x1B,0x36,0x6C,0xD8,0x37,0x6E,0xDC,0x3F,0x7E,0xFC,0x7F,0xFE,0x7B,0xF6,0x6B,
  0xD6,0x2B,0x56,0xAC,0xDF,0x39,0x72,0xE4,0x4F,0x9E,0xBB,0xF1,0x65,0xCA,0x13,0x26,
  0x4C,0x98,0xB7,0xE9,0x55,0xAA,0xD3,0x21,0x42,0x84,0x8F,0x99,0xB5,0xED,0x5D,0xBA,
  0xF3,0x61,0xC2,0x03,0x06,0x0C,0x18,0x30,0x60,0xC0,0x07,0x0E,0x1C,0x38,0x70,0xE0,
  0x47,0x8E,0x9B,0xB1,0xE5,0x4D,0x9A,0xB3,0xE1,0x45,0x8A,0x93,0xA1,0xC5,0x0D,0x1A,
  0x34,0x68,0xD0,0x27,0x4E,0x9C,0xBF,0xF9,0x75,0xEA,0x53,0xA6,0xCB,0x11,0x22,0x44,
  0x88,0x97,0xA9,0xD5,0x2D,0x5A,0xB4,0xEF,0x59,0xB2,0xE3,0x41,0x82,0x83,0x81,0x85,
  0x8D,0x9D,0xBD,0xFD,0x7D,0xFA,0x73,0xE6,0x4B,0x96,0xAB,0xD1,0x25,0x4A,0x94,0xAF,
  0xD9,0x35,0x6A,0xD4,0x2F,0x5E,0xBC,0xFF,0x79,0xF2,0x63,0xC6,0x0B,0x16,0x2C,0x58,
  0xB0,0xE7,0x49,0x92,0xA3,0xC1,0x05,0x0A,0x14,0x28,0x50,0xA0,0xC7,0x09,0x12,0x24,
  0x48,0x90,0xA7,0xC9,0x15,0x2A,0x54,0xA8,0xD7,0x29,0x52,0xA4,0xCF,0x19,0x32,0x64,
  0xC8,0x17,0x2E,0x5C,0xB8,0xF7,0x69,0xD2,0x23,0x46,0x8C,0x9F,0xB9,0xF5,0x6D,0xDA,
  0x33,0x66,0xCC,0x1F,0x3E,0x7C,0xF8,0x77,0xEE,0x5B,0xB6,0xEB,0x51,0xA2,0xC3,0x00
];

// CCSDS index_of 查找表 (GF(2^8) 指数表示)
var CCSDS_index_of = [
  255,0,1,99,2,198,100,106,3,205,199,188,101,126,107,42,
  4,141,206,78,200,212,189,225,102,221,127,49,108,32,43,243,
  5,87,142,232,207,172,79,131,201,217,213,65,190,148,226,180,
  103,39,222,240,128,177,50,53,109,69,33,18,44,13,244,56,
  6,155,88,26,143,121,233,112,208,194,173,168,80,117,132,72,
  202,252,218,138,214,84,66,36,191,152,149,249,227,94,181,21,
  104,97,40,186,223,76,241,47,129,230,178,63,51,238,54,16,
  110,24,70,166,34,136,19,247,45,184,14,61,245,164,57,59,
  7,158,156,157,89,159,27,8,144,9,122,28,234,160,113,90,
  209,29,195,123,174,10,169,145,81,91,118,114,133,161,73,235,
  203,124,253,196,219,30,139,210,215,146,85,170,67,11,37,175,
  192,115,153,119,150,92,250,82,228,236,95,74,182,162,22,134,
  105,197,98,254,41,125,187,204,224,211,77,140,242,31,48,220,
  130,171,231,86,179,147,64,216,52,176,239,38,55,12,17,68,
  111,120,25,154,71,116,167,193,35,83,137,251,20,93,248,151,
  46,75,185,96,15,237,62,229,246,135,165,23,58,163,60,183
];

// CCSDS 生成多项式
var CCSDS_poly = [
  249,59,83,185,198,201,218,21,198,59,165,150,105,107,96,225,
  53,214,86,181,144,183,13,58,122,243,106,17,9,139,158,175
];

function mod255(x) {
  while (x >= 255) {
    x -= 255;
    x = (x >> 8) + (x & 255);
  }
  return x;
}

/**
 * Reed-Solomon 编码器
 */
var ReedSolomonEncoder = {
  getDataLength: function() {
    return NN - NROOTS;
  },

  getParityLength: function() {
    return NROOTS;
  },

  /**
   * 编码：将 223 字节数据编码为 32 字节校验
   * @param {number[]} dataBytes - 输入数据 (223字节)
   * @param {number[]} out - 输出校验 (32字节)
   */
  encode: function(dataBytes, out) {
    var INDEX_OF = CCSDS_index_of;
    var ALPHA_TO = CCSDS_alpha_to;
    var GENPOLY = CCSDS_poly;
    var DLEN = NN - NROOTS;
    var A0 = NN;
    var feedback;
    var i, j;

    for (i = 0; i < NROOTS; i++) {
      out[i] = 0;
    }

    for (i = 0; i < DLEN; i++) {
      feedback = INDEX_OF[dataBytes[i] ^ out[0]];
      if (feedback !== A0) {
        for (j = 1; j < NROOTS; j++) {
          out[j] ^= ALPHA_TO[mod255(feedback + GENPOLY[NROOTS - j])];
        }
      }

      // shift
      for (j = 0; j < NROOTS - 1; j++) {
        out[j] = out[j + 1];
      }

      if (feedback !== A0) {
        out[NROOTS - 1] = ALPHA_TO[mod255(feedback + GENPOLY[0])];
      } else {
        out[NROOTS - 1] = 0;
      }
    }
  }
};

/**
 * Reed-Solomon 解码器
 * 使用 Berlekamp-Massey 算法
 */
var ReedSolomonDecoder = {
  /**
   * 解码：从 255 字节中恢复原始数据并纠错
   * @param {number[]} data - 输入数据 (255字节: 223数据 + 32校验)
   * @returns {{data: number[], errors: number}} 解码结果和纠错数
   */
  decode: function(data) {
    var INDEX_OF = CCSDS_index_of;
    var ALPHA_TO = CCSDS_alpha_to;
    var DLEN = NN - NROOTS;
    var A0 = NN;
    var numErrors = 0;

    // 计算伴随式 (syndromes)
    var synd = new Array(NROOTS);
    var i, j;
    var hasErrors = false;

    for (i = 0; i < NROOTS; i++) {
      synd[i] = 0;
      var evalVal = 0;
      for (j = 0; j < NN; j++) {
        evalVal ^= data[j];
        if (evalVal !== 0) {
          evalVal = ALPHA_TO[mod255(INDEX_OF[evalVal] + (i + 1))];
        }
      }
      synd[i] = evalVal;
      if (synd[i] !== 0) hasErrors = true;
    }

    if (!hasErrors) {
      return { data: data.slice(0, DLEN), errors: 0 };
    }

    // Berlekamp-Massey 算法求错误位置多项式
    var lambda = new Array(NROOTS + 1).fill(0);
    var b = new Array(NROOTS + 1).fill(0);
    lambda[0] = 1;
    b[0] = 1;

    var r = 0;
    var el = 0;
    var m;

    while (r < NROOTS) {
      var delta = synd[r];
      for (i = 1; i <= el; i++) {
        delta ^= ALPHA_TO[mod255(INDEX_OF[lambda[i]] + r - i + NROOTS)];
      }

      if (delta !== 0) {
        var t = lambda.slice();
        for (i = 0; i <= NROOTS; i++) {
          if (b[i] !== 0) {
            lambda[i + (r - el)] ^= ALPHA_TO[mod255(INDEX_OF[delta] + INDEX_OF[b[i]])];
          }
        }

        if (2 * el <= r) {
          el = r + 1 - el;
          b = t;
          for (i = 0; i <= NROOTS; i++) {
            b[i] = ALPHA_TO[mod255(NN - INDEX_OF[delta] + INDEX_OF[b[i]])];
          }
        }
      }
      r++;
    }

    // Chien 搜索找错误位置
    var errorPositions = [];
    for (i = 1; i <= NN; i++) {
      var evalLambda = 0;
      for (j = 0; j <= el; j++) {
        if (lambda[j] !== 0) {
          evalLambda ^= ALPHA_TO[mod255(INDEX_OF[lambda[j]] + (i * j) % NN)];
        }
      }
      if (evalLambda === 0) {
        errorPositions.push(NN - i);
      }
    }

    numErrors = errorPositions.length;

    if (numErrors > NROOTS / 2) {
      console.warn('RS解码: 错误数超过纠正能力 (' + numErrors + ' > ' + (NROOTS / 2) + ')');
      return { data: data.slice(0, DLEN), errors: -1 };
    }

    // Forney 算法计算错误值并修正
    if (numErrors > 0) {
      var omega = new Array(NROOTS).fill(0);
      for (i = 0; i < NROOTS; i++) {
        for (j = 0; j <= el; j++) {
          if (lambda[j] !== 0) {
            omega[i] ^= ALPHA_TO[mod255(INDEX_OF[lambda[j]] + INDEX_OF[synd[i]])];
          }
        }
      }

      for (i = 0; i < numErrors; i++) {
        var pos = errorPositions[i];
        var errorVal = 0;
        for (j = 0; j < NROOTS; j++) {
          if (omega[j] !== 0) {
            errorVal ^= ALPHA_TO[mod255(INDEX_OF[omega[j]] + (pos * j) % NN)];
          }
        }
        // 简化：直接修正
        data[pos] ^= errorVal;
      }
    }

    return { data: data.slice(0, DLEN), errors: numErrors };
  }
};

module.exports = {
  ReedSolomonEncoder: ReedSolomonEncoder,
  ReedSolomonDecoder: ReedSolomonDecoder,
  NN: NN,
  NROOTS: NROOTS
};
