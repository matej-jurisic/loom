using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkTypesAndTimeSplit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ActivityWorkTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ActivityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityWorkTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActivityWorkTypes_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OccurrenceTimeSplits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OccurrenceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Minutes = table.Column<int>(type: "INTEGER", nullable: true),
                    Position = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OccurrenceTimeSplits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OccurrenceTimeSplits_ActivityWorkTypes_WorkTypeId",
                        column: x => x.WorkTypeId,
                        principalTable: "ActivityWorkTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OccurrenceTimeSplits_Occurrences_OccurrenceId",
                        column: x => x.OccurrenceId,
                        principalTable: "Occurrences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActivityWorkTypes_ActivityId",
                table: "ActivityWorkTypes",
                column: "ActivityId");

            migrationBuilder.CreateIndex(
                name: "IX_OccurrenceTimeSplits_OccurrenceId_WorkTypeId",
                table: "OccurrenceTimeSplits",
                columns: new[] { "OccurrenceId", "WorkTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OccurrenceTimeSplits_WorkTypeId",
                table: "OccurrenceTimeSplits",
                column: "WorkTypeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OccurrenceTimeSplits");

            migrationBuilder.DropTable(
                name: "ActivityWorkTypes");
        }
    }
}
