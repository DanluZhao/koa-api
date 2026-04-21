const crypto = require("crypto");

const crudModel = require("../models/crudModel");

function createCrudController({ getSchemas }) {
  function apiOk(ctx, data, pagination) {
    ctx.status = 200;
    ctx.body = {
      success: true,
      data,
      pagination: pagination || undefined
    };
  }

  function apiFail(ctx, code, message, details) {
    ctx.status = 200;
    ctx.body = {
      success: false,
      data: null,
      error: {
        code,
        message,
        details: details !== undefined ? details : undefined
      }
    };
  }

  function transformRow(row, schema) {
    if (!row) return row;
    const transformed = { ...row };
    if (schema.primaryKey && row[schema.primaryKey] !== undefined) {
      transformed._id = row[schema.primaryKey];
    }
    return transformed;
  }

  async function getSchemaOrFail(ctx) {
    const table = ctx.params.table;
    try {
      const schemas = await getSchemas();
      const schema = schemas[table];
      if (!schema) {
        apiFail(ctx, "UNKNOWN_TABLE", "Unknown table", { table });
        return null;
      }
      return schema;
    } catch (err) {
      apiFail(ctx, "DB_ERROR", err?.message || "Database error");
      return null;
    }
  }

  async function list(ctx) {
    const schema = await getSchemaOrFail(ctx);
    if (!schema) return;

    const dbRes = await crudModel.listRows({
      schema,
      limit: ctx.query.limit,
      offset: ctx.query.offset,
      orderBy: ctx.query.orderBy,
      order: ctx.query.order
    });

    if (!dbRes.success) {
      apiFail(ctx, "DB_ERROR", dbRes.error, dbRes.code ? { code: dbRes.code } : undefined);
      return;
    }

    const { items, total, limit, offset } = dbRes.data || {};
    const safeLimit = Number(limit) || 50;
    const safeOffset = Number(offset) || 0;
    const safeTotal = Number(total) || 0;
    const page = safeLimit > 0 ? Math.floor(safeOffset / safeLimit) + 1 : 1;

    apiOk(
      ctx,
      (items || []).map((row) => transformRow(row, schema)),
      {
        total: safeTotal,
        page,
        limit: safeLimit,
        hasNext: safeOffset + safeLimit < safeTotal,
        hasPrev: safeOffset > 0
      }
    );
  }

  async function getById(ctx) {
    const schema = await getSchemaOrFail(ctx);
    if (!schema) return;

    const dbRes = await crudModel.getRowById({ schema, id: ctx.params.id });
    if (!dbRes.success) {
      apiFail(ctx, dbRes.code === "NOT_FOUND" ? "NOT_FOUND" : "DB_ERROR", dbRes.error);
      return;
    }

    apiOk(ctx, transformRow(dbRes.data, schema));
  }

  async function create(ctx) {
    const schema = await getSchemaOrFail(ctx);
    if (!schema) return;

    const payload = ctx.request.body || {};

    if (schema.shouldGenerateId && !payload.id) {
      payload.id = crypto.randomUUID();
    }

    const dbRes = await crudModel.createRow({ schema, payload });
    if (!dbRes.success) {
      apiFail(ctx, dbRes.code === "INVALID_PARAM" ? "INVALID_PARAM" : "DB_ERROR", dbRes.error);
      return;
    }

    const createdId = dbRes.data;
    let item;
    const fetchRes = await crudModel.getRowById({ schema, id: createdId });
    if (fetchRes.success) item = transformRow(fetchRes.data, schema);

    apiOk(ctx, { id: createdId, item });
  }

  async function updateById(ctx) {
    const schema = await getSchemaOrFail(ctx);
    if (!schema) return;

    const dbRes = await crudModel.updateRowById({
      schema,
      id: ctx.params.id,
      payload: ctx.request.body || {}
    });

    if (!dbRes.success) {
      apiFail(
        ctx,
        dbRes.code === "NOT_FOUND" ? "NOT_FOUND" : dbRes.code === "INVALID_PARAM" ? "INVALID_PARAM" : "DB_ERROR",
        dbRes.error
      );
      return;
    }

    let item;
    const fetchRes = await crudModel.getRowById({ schema, id: ctx.params.id });
    if (fetchRes.success) item = transformRow(fetchRes.data, schema);

    apiOk(ctx, { updated: dbRes.data, item });
  }

  async function removeById(ctx) {
    const schema = await getSchemaOrFail(ctx);
    if (!schema) return;

    const dbRes = await crudModel.deleteRowById({ schema, id: ctx.params.id });
    if (!dbRes.success) {
      apiFail(ctx, dbRes.code === "NOT_FOUND" ? "NOT_FOUND" : "DB_ERROR", dbRes.error);
      return;
    }

    apiOk(ctx, dbRes.data);
  }

  async function meta(ctx) {
    const table = ctx.params.table;
    try {
      const schemas = await getSchemas();
      const schema = schemas[table];
      if (!schema) {
        apiFail(ctx, "UNKNOWN_TABLE", "Unknown table", { table });
        return;
      }
      apiOk(ctx, schema);
    } catch (err) {
      apiFail(ctx, "DB_ERROR", err?.message || "Database error");
    }
  }

  async function listTables(ctx) {
    try {
      const schemas = await getSchemas();
      apiOk(ctx, Object.keys(schemas).sort());
    } catch (err) {
      apiFail(ctx, "DB_ERROR", err?.message || "Database error");
    }
  }

  return {
    listTables,
    meta,
    list,
    getById,
    create,
    updateById,
    removeById
  };
}

module.exports = {
  createCrudController
};
