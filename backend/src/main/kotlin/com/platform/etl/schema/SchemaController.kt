package com.platform.etl.schema

import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/connections/{connectionId}/schema")
class SchemaController(private val service: SchemaService) {

    @GetMapping("/tables")
    fun listTables(@PathVariable connectionId: UUID) =
        SchemaResponse(connectionId.toString(), service.listTables(connectionId))

    @GetMapping("/tables/{tableName}")
    fun getTableSchema(
        @PathVariable connectionId: UUID,
        @PathVariable tableName: String,
        @RequestParam(required = false) schema: String?
    ) = TableSchemaResponse(connectionId.toString(), tableName,
        service.getTableSchema(connectionId, tableName, schema))
}
