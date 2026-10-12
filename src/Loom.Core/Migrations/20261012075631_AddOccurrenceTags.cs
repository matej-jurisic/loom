using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddOccurrenceTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OccurrenceTags",
                columns: table => new
                {
                    OccurrenceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TagId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OccurrenceTags", x => new { x.OccurrenceId, x.TagId });
                    table.ForeignKey(
                        name: "FK_OccurrenceTags_Occurrences_OccurrenceId",
                        column: x => x.OccurrenceId,
                        principalTable: "Occurrences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OccurrenceTags_Tags_TagId",
                        column: x => x.TagId,
                        principalTable: "Tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OccurrenceTags_TagId",
                table: "OccurrenceTags",
                column: "TagId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OccurrenceTags");
        }
    }
}
