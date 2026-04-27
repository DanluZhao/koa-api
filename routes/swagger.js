const Router = require("@koa/router");
const mount = require("koa-mount");
const serve = require("koa-static");
const swaggerUiDist = require("swagger-ui-dist");

function buildOpenApi(serverUrl) {
  const apiVersion = process.env.API_VERSION || "v1";

  return {
    openapi: "3.0.3",
    info: {
      title: "OVI API",
      version: apiVersion
    },
    servers: serverUrl ? [{ url: serverUrl }] : undefined,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      },
      schemas: {
        AnyObject: {
          type: "object",
          additionalProperties: true
        },
        ApiError: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: { nullable: true }
          }
        },
        Pagination: {
          type: "object",
          properties: {
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
            hasNext: { type: "boolean" },
            hasPrev: { type: "boolean" }
          }
        },
        ApiResponseAny: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { nullable: true },
            error: { $ref: "#/components/schemas/ApiError" },
            pagination: { $ref: "#/components/schemas/Pagination" }
          }
        }
      }
    },
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/register": {
        post: {
          summary: "Admin register (admin table)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" }
                  },
                  required: ["username", "password"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/login": {
        post: {
          summary: "Admin login (admin table) -> JWT token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" }
                  },
                  required: ["username", "password"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/logout": {
        post: {
          summary: "Logout",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/token/refresh": {
        post: {
          summary: "Refresh token",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/session/restore": {
        post: {
          summary: "Restore session",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/me": {
        get: {
          summary: "Get current auth payload",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/permissions": {
        get: {
          summary: "List admin user permissions (sys_auth)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create/update admin user permissions (sys_auth)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userid: { type: "string", description: "admin.id" },
                    authModules: {
                      nullable: false,
                      description: "JSON modules payload",
                      oneOf: [
                        {
                          type: "array",
                          items: { type: "string" },
                          example: ["products", "articles"]
                        },
                        {
                          type: "object",
                          additionalProperties: true,
                          example: { products: true, articles: true }
                        },
                        {
                          type: "string",
                          example: "[\"products\",\"articles\"]"
                        }
                      ]
                    }
                  },
                  required: ["userid", "authModules"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/auth/permissions/{userid}": {
        get: {
          summary: "Get admin user permissions by userid (sys_auth)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "userid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/system/nicknames": {
        get: {
          summary: "List system random nicknames (sys_nickname)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create a system random nickname (sys_nickname)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nickname: { type: "string" },
                    isEnable: { type: "boolean", default: true }
                  },
                  required: ["nickname"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/system/nicknames/import": {
        post: {
          summary: "Import random nicknames (xlsx, first column is nickname)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "Upload file field name: file"
                    }
                  },
                  required: ["file"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/system/nicknames/{id}/enable": {
        patch: {
          summary: "Toggle nickname enable (sys_nickname.isEnable)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isEnable: { type: "boolean" }
                  },
                  required: ["isEnable"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/auth/login/wechat": {
        post: {
          summary: "App user login (wechat) - not implemented yet",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/auth/login/jiguang": {
        post: {
          summary: "App user login (jiguang). Existing user -> token; new user -> registerToken",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    phone: { type: "string" },
                    username: { type: "string" },
                    operator: { type: "string" },
                    riskScore: { type: "number" }
                  },
                  oneOf: [{ required: ["phone"] }, { required: ["username"] }]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    existingUser: { value: { success: true, data: { token: "JWT_TOKEN", isNewUser: false } } },
                    newUserNeedsComplete: { value: { success: true, data: { needsComplete: true, registerToken: "REGISTER_TOKEN" } } }
                  }
                }
              }
            }
          }
        }
      },
      "/app/auth/register/jiguang/complete": {
        post: {
          summary: "Complete jiguang registration and create users row -> token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    registerToken: { type: "string" },
                    loginToken: { type: "string", description: "Optional fallback if registerToken is missing." },
                    exID: { type: "string", description: "Optional. For loginToken verification." },
                    ip: { type: "string", description: "Optional. For loginToken verification. If omitted, server will infer from request." },
                    nickname: { type: "string" },
                    avatar: { type: "string", description: "Optional. May store avatar filename/key." },
                    avatar_Url: { type: "string", description: "Avatar URL chosen by user." },
                    birthDate: { type: "string", description: "Birthday string." }
                  },
                  required: ["nickname", "avatar_Url", "birthDate"],
                  oneOf: [{ required: ["registerToken"] }, { required: ["loginToken"] }]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/auth/login/jiguang/verify": {
        post: {
          summary: "Verify jiguang loginToken -> decrypt phone (cloud function replacement)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    loginToken: { type: "string" },
                    exID: { type: "string" },
                    ip: { type: "string", description: "Optional. v2 only. If omitted, server will infer from request." }
                  },
                  required: ["loginToken"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    newUserNeedsComplete: {
                      value: { success: true, data: { phone: "13800138000", score: 80, code: 8000, needsComplete: true, registerToken: "REGISTER_TOKEN" } }
                    },
                    existingUserLogin: {
                      value: { success: true, data: { phone: "13800138000", score: 80, code: 8000, token: "JWT_TOKEN", isNewUser: false } }
                    },
                    failed: {
                      value: {
                        success: false,
                        data: null,
                        error: {
                          code: "JIGUANG_VERIFY_FAILED",
                          message: "invalid token",
                          details: { jiguangCode: 8005 }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/app/users/me": {
        get: {
          summary: "Get current app user profile (users table)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        patch: {
          summary: "Update current app user profile (users table)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/users/me/liquidsetting": {
        get: {
          summary: "Get current user's liquidsetting (user_liquidsetting + sys_liquidsetting)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Set current user's liquidsetting (upsert user_liquidsetting)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    liquidsettingId: { type: "string", description: "sys_liquidsetting.id" }
                  },
                  required: ["liquidsettingId"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/system/avatars": {
        get: {
          summary: "Get system avatar urls (sys_profilephoto) - public",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    success: {
                      value: {
                        success: true,
                        data: ["https://your-domain/media/uploads/images/a.jpg", "https://your-domain/media/uploads/images/b.jpg"]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/app/system/nicknames": {
        get: {
          summary: "List enabled random nicknames (sys_nickname) - public",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/system/liquidsettings/gap": {
        get: {
          summary: "List system liquidsettings (type=gap) - public",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/system/liquidsettings/total": {
        get: {
          summary: "List system liquidsettings (type=total) - public",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/articles": {
        get: {
          summary: "List published articles",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "sortBy", in: "query", required: false, schema: { type: "string", default: "publishDate" } },
            { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/articles/{id}": {
        get: {
          summary: "Get article by id (and viewCount + 1)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/articles/category/{category}": {
        get: {
          summary: "List articles by category (may require schema update)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "category", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/articles/search": {
        get: {
          summary: "Search articles",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/ads/new-products": {
        get: {
          summary: "Get homepage new-products ad (ads_new_products)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/products": {
        get: {
          summary: "List products",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "category", in: "query", required: false, schema: { type: "string" }, description: "Mapped to products.type" },
            { name: "searchText", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "sortBy", in: "query", required: false, schema: { type: "string", default: "createdAt" } },
            { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/products/{id}": {
        get: {
          summary: "Get product by id",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/meditation/audios": {
        get: {
          summary: "List meditation audios",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/kegels": {
        get: {
          summary: "List kegels (requires kegels table)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/usage/summary": {
        get: {
          summary: "Get current user usage summary",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/usage/records": {
        get: {
          summary: "List current user usage records",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create a usage record",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    duration: { type: "number" },
                    mode: { type: "string" },
                    toy_id: { type: "string" },
                    used_at: { type: "string", description: "ISO datetime string" }
                  },
                  required: ["duration", "mode"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/achievements/catalog": {
        get: {
          summary: "List achievements catalog",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/achievements/my-codes": {
        get: {
          summary: "Get current user achievement codes",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/achievements/award": {
        post: {
          summary: "Award achievement (idempotent)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    code: { type: "string" }
                  },
                  required: ["code"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/waveforms/preset": {
        get: {
          summary: "List preset waveforms",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/waveforms/custom": {
        get: {
          summary: "List current user custom waveforms",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create custom waveform",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sequence: { nullable: false }
                  },
                  required: ["name", "sequence"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/app/waveforms/custom/{id}": {
        patch: {
          summary: "Update custom waveform",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        delete: {
          summary: "Delete custom waveform",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/register": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Admin register (admin table)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" }
                  },
                  required: ["username", "password"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/login": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Admin login (admin table) -> JWT token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" }
                  },
                  required: ["username", "password"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/logout": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Logout",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/token/refresh": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Refresh token (not implemented yet)",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/session/restore": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Restore session",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/me": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get current auth payload",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/login/wechat": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: App user login (wechat) - not implemented yet",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/auth/login/jiguang": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: App user login (jiguang). Existing user -> token; new user -> registerToken",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    phone: { type: "string" },
                    username: { type: "string" },
                    operator: { type: "string" },
                    riskScore: { type: "number" }
                  },
                  oneOf: [{ required: ["phone"] }, { required: ["username"] }]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    existingUser: { value: { success: true, data: { token: "JWT_TOKEN", isNewUser: false } } },
                    newUserNeedsComplete: { value: { success: true, data: { needsComplete: true, registerToken: "REGISTER_TOKEN" } } }
                  }
                }
              }
            }
          }
        }
      },
      "/users/me": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get current app user profile (users table)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        patch: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Update current app user profile (users table)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/system/avatars": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get system avatar urls (sys_profilephoto) - public",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    success: {
                      value: {
                        success: true,
                        data: ["https://your-domain/media/uploads/images/a.jpg", "https://your-domain/media/uploads/images/b.jpg"]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/articles": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List published articles",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "sortBy", in: "query", required: false, schema: { type: "string", default: "publishDate" } },
            { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/articles/{id}": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get article by id (and viewCount + 1)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/articles/category/{category}": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List articles by category (may require schema update)",
          parameters: [{ name: "category", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/articles/search": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Search articles",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/ads/new-products": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get homepage new-products ad (ads_new_products)",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/products": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List products",
          parameters: [
            { name: "category", in: "query", required: false, schema: { type: "string" }, description: "Mapped to products.type" },
            { name: "searchText", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "sortBy", in: "query", required: false, schema: { type: "string", default: "createdAt" } },
            { name: "sortOrder", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/products/{id}": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get product by id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/meditation/audios": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List meditation audios",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/kegels": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List kegels (requires kegels table)",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/usage/summary": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get current user usage summary",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/usage/records": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List current user usage records",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Create a usage record",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    duration: { type: "number" },
                    mode: { type: "string" },
                    toy_id: { type: "string" },
                    used_at: { type: "string", description: "ISO datetime string" }
                  },
                  required: ["duration", "mode"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/achievements/catalog": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List achievements catalog",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/achievements/my-codes": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Get current user achievement codes",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/achievements/award": {
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Award achievement (idempotent)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    code: { type: "string" }
                  },
                  required: ["code"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/waveforms/preset": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List preset waveforms",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/waveforms/custom": {
        get: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: List current user custom waveforms",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 200 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Create custom waveform",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sequence: { nullable: false }
                  },
                  required: ["name", "sequence"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/waveforms/custom/{id}": {
        patch: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Update custom waveform",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        delete: {
          tags: ["Legacy"],
          deprecated: true,
          summary: "Legacy: Delete custom waveform",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/version": {
        get: {
          summary: "Get API version",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/test-db": {
        post: {
          summary: "Test DB connectivity (SELECT 1+1)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/api/test-db": {
        post: {
          summary: "Test DB connectivity (SELECT 1+1)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/upload": {
        post: {
          summary: "Unified upload (image/audio)",
          description:
            "Support jpg/png/webp/mp3/wav/m4a, max 50MB. File is renamed by timestamp+UUID and stored under /media/uploads/images or /media/uploads/audio.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "Upload file field name: file"
                    }
                  },
                  required: ["file"]
                }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" },
                  examples: {
                    success: {
                      value: {
                        success: true,
                        data: {
                          url: "http://your-domain/media/uploads/images/1711111111111-uuid.jpg",
                          filename: "1711111111111-uuid.jpg"
                        }
                      }
                    },
                    invalidType: {
                      value: {
                        success: false,
                        data: null,
                        error: {
                          code: "UNSUPPORTED_FILE_TYPE",
                          message: "Only jpg/png/webp/mp3/wav/m4a are supported"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/tables": {
        get: {
          summary: "List tables (introspected from database)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/{table}/meta": {
        get: {
          summary: "Get table meta (introspected from database)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "table",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/{table}": {
        get: {
          summary: "List rows",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "orderBy", in: "query", required: false, schema: { type: "string" } },
            { name: "order", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create row",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/api/{table}/{id}": {
        get: {
          summary: "Get row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        put: {
          summary: "Update row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        delete: {
          summary: "Delete row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/api/tables": {
        get: {
          summary: "List tables (introspected from database)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/api/{table}/meta": {
        get: {
          summary: "Get table meta (introspected from database)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "table",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/api/{table}": {
        get: {
          summary: "List rows",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "orderBy", in: "query", required: false, schema: { type: "string" } },
            { name: "order", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        post: {
          summary: "Create row",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      },
      "/admin/api/{table}/{id}": {
        get: {
          summary: "Get row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        put: {
          summary: "Update row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnyObject" }
              }
            }
          },
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        },
        delete: {
          summary: "Delete row by id",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "table", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiResponseAny" }
                }
              }
            }
          }
        }
      }
    }
  };
}

function buildSwaggerHtml() {
  const cssUrl = "/docs/swagger-ui.css";
  const bundleUrl = "/docs/swagger-ui-bundle.js";
  const presetUrl = "/docs/swagger-ui-standalone-preset.js";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OVI API Docs</title>
    <link rel="stylesheet" type="text/css" href="${cssUrl}" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${bundleUrl}"></script>
    <script src="${presetUrl}"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout"
      });
    </script>
  </body>
</html>`;
}

const swaggerAssetsMiddleware = serve(swaggerUiDist.getAbsoluteFSPath(), { index: false });
const swaggerUiMiddleware = mount("/docs", serve(swaggerUiDist.getAbsoluteFSPath(), { index: false }));

const swaggerRouter = new Router();
swaggerRouter.get("/openapi.json", async (ctx) => {
  ctx.type = "application/json";
  ctx.body = buildOpenApi(ctx.origin);
});
swaggerRouter.get("/docs", async (ctx) => {
  ctx.type = "text/html";
  ctx.body = buildSwaggerHtml();
});
swaggerRouter.get("/docs/", async (ctx) => {
  ctx.redirect("/docs");
});

module.exports = {
  swaggerAssetsMiddleware,
  swaggerUiMiddleware,
  swaggerRouter
};
