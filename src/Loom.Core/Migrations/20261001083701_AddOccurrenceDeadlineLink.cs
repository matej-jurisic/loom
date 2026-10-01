using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddOccurrenceDeadlineLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DeadlineOccurrenceId",
                table: "Occurrences",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Occurrences_DeadlineOccurrenceId",
                table: "Occurrences",
                column: "DeadlineOccurrenceId");

            migrationBuilder.AddForeignKey(
                name: "FK_Occurrences_Occurrences_DeadlineOccurrenceId",
                table: "Occurrences",
                column: "DeadlineOccurrenceId",
                principalTable: "Occurrences",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Occurrences_Occurrences_DeadlineOccurrenceId",
                table: "Occurrences");

            migrationBuilder.DropIndex(
                name: "IX_Occurrences_DeadlineOccurrenceId",
                table: "Occurrences");

            migrationBuilder.DropColumn(
                name: "DeadlineOccurrenceId",
                table: "Occurrences");
        }
    }
}
