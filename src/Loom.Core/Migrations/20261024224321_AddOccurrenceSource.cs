using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddOccurrenceSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceOccurrenceId",
                table: "Occurrences",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Occurrences_SourceOccurrenceId",
                table: "Occurrences",
                column: "SourceOccurrenceId");

            migrationBuilder.AddForeignKey(
                name: "FK_Occurrences_Occurrences_SourceOccurrenceId",
                table: "Occurrences",
                column: "SourceOccurrenceId",
                principalTable: "Occurrences",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Occurrences_Occurrences_SourceOccurrenceId",
                table: "Occurrences");

            migrationBuilder.DropIndex(
                name: "IX_Occurrences_SourceOccurrenceId",
                table: "Occurrences");

            migrationBuilder.DropColumn(
                name: "SourceOccurrenceId",
                table: "Occurrences");
        }
    }
}
